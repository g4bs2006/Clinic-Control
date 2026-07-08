"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope, getCurrentProfile } from "@/lib/users/actions";
import { listClinics } from "@/lib/clinics/actions";

export type AcompanhamentoStatus = "aberto" | "resolvido" | "dispensado";

export type AcompanhamentoRow = {
  id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  title: string;
  description: string | null;
  status: AcompanhamentoStatus;
  severity: "baixa" | "media" | "alta";
  assigned_to: string | null;
  assigned_to_name: string | null;
  source: "manual" | "ia";
  created_at: string;
  resolved_at: string | null;
};

const SELECT =
  "id, clinic_id, title, description, status, severity, assigned_to, source, created_at, resolved_at, clinics(name), assignee:app_users!assigned_to(name)";

type SingleOrArray<T> = T | T[] | null;
function unwrapName(v: SingleOrArray<{ name: string | null }>): string | null {
  if (!v) return null;
  const row = Array.isArray(v) ? v[0] : v;
  return row?.name ?? null;
}

async function requireUser() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

/** IDs de clínica da carteira ativa (null = sem restrição). Mesma regra das tarefas. */
async function carteiraClinicIds(): Promise<string[] | null> {
  const scope = await getCarteiraScope();
  if (!scope.developerFilter) return null;
  const clinics = await listClinics();
  return clinics.filter((c) => c.developer_id === scope.developerFilter).map((c) => c.id);
}

function mapRow(row: Record<string, unknown>): AcompanhamentoRow {
  return {
    id: row.id as string,
    clinic_id: (row.clinic_id as string | null) ?? null,
    clinic_name: unwrapName(row.clinics as SingleOrArray<{ name: string | null }>),
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as AcompanhamentoStatus,
    severity: (row.severity as "baixa" | "media" | "alta") ?? "media",
    assigned_to: (row.assigned_to as string | null) ?? null,
    assigned_to_name: unwrapName(row.assignee as SingleOrArray<{ name: string | null }>),
    source: row.source as "manual" | "ia",
    created_at: row.created_at as string,
    resolved_at: (row.resolved_at as string | null) ?? null,
  };
}

/** Lista os acompanhamentos respeitando a carteira (mesma regra das tarefas). */
export async function listAcompanhamentos(): Promise<AcompanhamentoRow[]> {
  const supabase = await createClient();
  const clinicIds = await carteiraClinicIds();

  let query = supabase.from("acompanhamentos").select(SELECT);
  if (clinicIds !== null) {
    const profile = await getCurrentProfile();
    query = clinicIds.length
      ? query.or(`assigned_to.eq.${profile!.id},clinic_id.in.(${clinicIds.join(",")})`)
      : query.eq("assigned_to", profile!.id);
  }

  const { data, error } = await query
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function updateAcompanhamentoStatus(id: string, status: AcompanhamentoStatus) {
  const supabase = await requireUser();
  if (!supabase) return { ok: false as const, error: "Não autenticado" };
  const { error } = await supabase
    .from("acompanhamentos")
    .update({ status, resolved_at: status === "aberto" ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/acompanhamentos");
  return { ok: true as const };
}

export async function deleteAcompanhamento(id: string) {
  const supabase = await requireUser();
  if (!supabase) return { ok: false as const, error: "Não autenticado" };
  const { error } = await supabase.from("acompanhamentos").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/acompanhamentos");
  return { ok: true as const };
}

export async function createAcompanhamento(input: {
  clinicId: string | null;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  severity?: "baixa" | "media" | "alta";
}) {
  const supabase = await requireUser();
  if (!supabase) return { ok: false as const, error: "Não autenticado" };
  const user = await getSessionUser();
  const title = input.title.trim();
  if (title.length < 3) return { ok: false as const, error: "Título muito curto" };

  const { data, error } = await supabase
    .from("acompanhamentos")
    .insert({
      clinic_id: input.clinicId,
      title,
      description: input.description?.trim() || null,
      assigned_to: input.assignedTo ?? null,
      severity: input.severity ?? "media",
      source: "manual",
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/acompanhamentos");
  return { ok: true as const, id: data.id as string };
}

/** Aceita uma sugestão de tipo 'acompanhamento' → cria o acompanhamento e marca a sugestão. */
export async function acceptSuggestionAsAcompanhamento(
  suggestionId: string,
  input?: { assignedTo?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const user = await getSessionUser();

  const { data: s, error: fe } = await supabase
    .from("task_suggestions")
    .select("id, text, description, clinic_id, summary_id, severity, status")
    .eq("id", suggestionId)
    .maybeSingle();
  if (fe) return { ok: false, error: fe.message };
  if (!s) return { ok: false, error: "Sugestão não encontrada" };
  if (s.status !== "pending") return { ok: false, error: "Sugestão já revisada" };

  const { data: created, error: ce } = await supabase
    .from("acompanhamentos")
    .insert({
      clinic_id: s.clinic_id as string,
      summary_id: (s.summary_id as string | null) ?? null,
      title: (s.text as string).slice(0, 200),
      description: (s.description as string | null) ?? null,
      severity: (s.severity as "baixa" | "media" | "alta") ?? "media",
      assigned_to: input?.assignedTo ?? null,
      source: "ia",
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (ce) return { ok: false, error: ce.message };

  const { error: ue } = await supabase
    .from("task_suggestions")
    .update({ status: "accepted", reviewed_at: new Date().toISOString(), reviewed_by: user!.id })
    .eq("id", suggestionId);
  if (ue) return { ok: false, error: ue.message };

  revalidatePath("/acompanhamentos");
  revalidatePath("/tarefas");
  return { ok: true, id: created.id as string };
}
