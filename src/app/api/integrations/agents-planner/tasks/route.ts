import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TASK_PRIORITY_RANK, type TaskPriority, type TaskStatus } from "@/lib/tasks/categories";
import { clinicIdsOwnedBy, verifyApiToken } from "@/lib/tokens/verify";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Read-only integration endpoint for the Agents Planner desktop app (a separate,
 * personal tool — not part of this app's own UI). Authenticates via a per-user
 * API token (see `src/lib/tokens/`), and scopes strictly to that user's own
 * carteira (`clinics.developer_id`) — deliberately NOT `getCarteiraScope()`,
 * whose "gestor sees everything" branch makes no sense for a machine token: a
 * token always sees only its owner's clinics, even if the owner is a gestor.
 */

type NameRelation = { name: string | null } | { name: string | null }[] | null;
function unwrapName(rel: NameRelation): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

const OPEN_STATUSES: TaskStatus[] = ["pendente", "em_andamento", "em_aprovacao"];

/** Ids de tasks internas atribuídas a `userId` — mesma lógica de `taskIdsAssignedTo`
 *  em `src/lib/tasks/actions.ts` (privada lá, replicada aqui por não dar pra importar). */
async function assignedTaskIds(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.task_id as string);
}

export async function GET(request: NextRequest) {
  const auth = await verifyApiToken(request.headers.get("x-agents-planner-secret"));
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const [clinicIds, myTaskIds] = await Promise.all([
    clinicIdsOwnedBy(auth.userId),
    assignedTaskIds(supabase, auth.userId),
  ]);

  // Sentinela (nenhum uuid real bate) em vez de ramificar o tipo da query quando
  // o dono do token não tem clínica nem task interna atribuída — mesmo truque
  // que `listTasks()`/`listArchivedTasks()` já usam em `tasks/actions.ts`.
  const NO_MATCH = "00000000-0000-0000-0000-000000000000";
  const scopeClauses = [
    ...(clinicIds.length ? [`clinic_id.in.(${clinicIds.join(",")})`] : []),
    ...(myTaskIds.length ? [`id.in.(${myTaskIds.join(",")})`] : []),
  ];
  const scopeFilter = scopeClauses.length ? scopeClauses.join(",") : `id.eq.${NO_MATCH}`;
  const suggestionClinicIds = clinicIds.length ? clinicIds : [NO_MATCH];

  const [tasksResult, suggestionsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, clinic_id, title, description, category, priority, status, due_date, source, is_internal, pinned_at, snoozed_until, created_at, clinics(name)",
      )
      .is("parent_task_id", null)
      .is("archived_at", null)
      .in("status", OPEN_STATUSES)
      .or(scopeFilter)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from("task_suggestions")
      .select(
        "id, clinic_id, summary_id, text, description, kind, severity, clinics(name), whatsapp_daily_summaries(summary_date)",
      )
      .eq("status", "pending")
      .in("clinic_id", suggestionClinicIds)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (tasksResult.error) {
    return NextResponse.json({ error: tasksResult.error.message }, { status: 500 });
  }
  if (suggestionsResult.error) {
    return NextResponse.json({ error: suggestionsResult.error.message }, { status: 500 });
  }

  // Filtro de "adiada" aplicado em memória — evita combinar dois grupos `or()`
  // (escopo de carteira + snoozed) numa query só, que o cliente supabase-js não
  // expressa de forma limpa.
  const todayIso = new Date().toISOString().slice(0, 10);
  const scopedTasksData = (tasksResult.data ?? []).filter((row) => {
    const snoozedUntil = row.snoozed_until as string | null;
    return !snoozedUntil || snoozedUntil <= todayIso;
  });

  const tasks = scopedTasksData
    .map((row) => ({
      id: row.id as string,
      clinicId: row.clinic_id as string | null,
      clinicName: unwrapName(row.clinics as NameRelation),
      title: row.title as string,
      description: row.description as string | null,
      category: row.category as string,
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
      dueDate: row.due_date as string | null,
      source: row.source as "manual" | "ia",
      isInternal: (row.is_internal as boolean) ?? false,
      pinned: row.pinned_at != null,
      createdAt: row.created_at as string,
    }))
    .sort((a, b) => TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority]);

  const suggestions = (suggestionsResult.data ?? []).map((row) => {
    const summary = row.whatsapp_daily_summaries as { summary_date: string } | { summary_date: string }[] | null;
    const summaryRow = Array.isArray(summary) ? summary[0] : summary;
    return {
      id: row.id as string,
      clinicId: row.clinic_id as string,
      clinicName: unwrapName(row.clinics as NameRelation) ?? "—",
      text: row.text as string,
      description: (row.description as string | null) ?? null,
      kind: (row.kind as "acao" | "acompanhamento" | null) ?? "acao",
      severity: (row.severity as "baixa" | "media" | "alta" | null) ?? "media",
      summaryDate: summaryRow?.summary_date ?? "",
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    tasks,
    suggestions,
  });
}
