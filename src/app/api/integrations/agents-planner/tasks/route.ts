import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TASK_PRIORITY_RANK, type TaskPriority, type TaskStatus } from "@/lib/tasks/categories";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Read-only integration endpoint for the Agents Planner desktop app (a separate,
 * personal tool — not part of this app's own UI). Bypasses the session/carteira
 * model entirely (there's no logged-in user here, and the caller should see
 * everything), unlike `listTasks`/`listTaskSuggestions` in `src/lib/tasks/actions.ts`.
 *
 * Auth mirrors `src/app/api/helena/overviews-collect/route.ts`'s shape, but with
 * its own dedicated secret — this route is reachable from outside this app's own
 * infra, unlike the cron-only routes that share `COLLECT_GROUPS_CRON_SECRET`.
 */

type NameRelation = { name: string | null } | { name: string | null }[] | null;
function unwrapName(rel: NameRelation): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

const OPEN_STATUSES: TaskStatus[] = ["pendente", "em_andamento", "em_aprovacao"];

export async function GET(request: NextRequest) {
  const secret = process.env.AGENTS_PLANNER_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AGENTS_PLANNER_API_SECRET não configurado" }, { status: 500 });
  }
  if (request.headers.get("x-agents-planner-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const [tasksResult, suggestionsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, clinic_id, title, description, category, priority, status, due_date, source, is_internal, pinned_at, created_at, clinics(name)",
      )
      .is("parent_task_id", null)
      .is("archived_at", null)
      .in("status", OPEN_STATUSES)
      .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString().slice(0, 10)}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from("task_suggestions")
      .select(
        "id, clinic_id, summary_id, text, description, kind, severity, clinics(name), whatsapp_daily_summaries(summary_date)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (tasksResult.error) {
    return NextResponse.json({ error: tasksResult.error.message }, { status: 500 });
  }
  if (suggestionsResult.error) {
    return NextResponse.json({ error: suggestionsResult.error.message }, { status: 500 });
  }

  const tasks = (tasksResult.data ?? [])
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
