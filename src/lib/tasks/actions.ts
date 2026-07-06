"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/users/actions";
import { listClinics } from "@/lib/clinics/actions";
import type { TaskCategory, TaskPriority, TaskStatus } from "./categories";

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskRow = {
  id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  source: "manual" | "ia";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskSuggestionRow = {
  id: string;
  clinic_id: string;
  clinic_name: string;
  summary_id: string;
  summary_date: string;
  text: string;
};

export type TaskFilters = {
  status?: TaskStatus;
  category?: TaskCategory;
  priority?: TaskPriority;
  clinicId?: string;
  assignedTo?: string;
};

type SingleOrArray<T> = T | T[] | null;
function unwrapName(rel: SingleOrArray<{ name: string | null }>): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

async function requireUser() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

/** IDs de clínica da carteira do desenvolvedor logado (null se for gestor — sem restrição). */
async function carteiraClinicIds(): Promise<string[] | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "desenvolvedor") return null;
  const clinics = await listClinics();
  return clinics.filter((c) => c.developer_id === profile.id).map((c) => c.id);
}

function mapTaskRow(row: Record<string, unknown>): TaskRow {
  return {
    id: row.id as string,
    clinic_id: row.clinic_id as string | null,
    clinic_name: unwrapName(row.clinics as SingleOrArray<{ name: string | null }>),
    title: row.title as string,
    description: row.description as string | null,
    category: row.category as TaskCategory,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    assigned_to: row.assigned_to as string | null,
    assigned_to_name: unwrapName(row.assignee as SingleOrArray<{ name: string | null }>),
    due_date: row.due_date as string | null,
    source: row.source as "manual" | "ia",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Lista tarefas respeitando a carteira: desenvolvedor vê as tarefas das
 * clínicas dele + as atribuídas a ele mesmo (mesmo sem clínica); gestor vê
 * todas. Filtros adicionais (status/categoria/prioridade/clínica/responsável)
 * se combinam com esse escopo.
 */
export async function listTasks(filters: TaskFilters = {}): Promise<TaskRow[]> {
  const supabase = await createClient();
  const clinicIds = await carteiraClinicIds();

  let query = supabase
    .from("tasks")
    .select(
      "id, clinic_id, title, description, category, priority, status, assigned_to, due_date, source, created_at, updated_at, completed_at, clinics(name), assignee:app_users!assigned_to(name)",
    );

  if (clinicIds !== null) {
    const profile = await getCurrentProfile();
    query = clinicIds.length
      ? query.or(`assigned_to.eq.${profile!.id},clinic_id.in.(${clinicIds.join(",")})`)
      : query.eq("assigned_to", profile!.id);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);

  const { data, error } = await query.order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTaskRow);
}

/** Tarefas de uma clínica específica (para o painel no perfil dela). */
export async function listClinicTasks(clinicId: string): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, clinic_id, title, description, category, priority, status, assigned_to, due_date, source, created_at, updated_at, completed_at, clinics(name), assignee:app_users!assigned_to(name)",
    )
    .eq("clinic_id", clinicId)
    .order("status")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTaskRow);
}

/** Sugestões pendentes de revisão (escopo: mesma regra de carteira). */
export async function listTaskSuggestions(): Promise<TaskSuggestionRow[]> {
  const supabase = await createClient();
  const clinicIds = await carteiraClinicIds();

  let query = supabase
    .from("task_suggestions")
    .select("id, clinic_id, summary_id, text, clinics(name), whatsapp_daily_summaries(summary_date)")
    .eq("status", "pending");
  if (clinicIds !== null) {
    if (!clinicIds.length) return [];
    query = query.in("clinic_id", clinicIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const summary = row.whatsapp_daily_summaries as { summary_date: string } | { summary_date: string }[] | null;
    const summaryRow = Array.isArray(summary) ? summary[0] : summary;
    return {
      id: row.id as string,
      clinic_id: row.clinic_id as string,
      clinic_name: unwrapName(row.clinics as SingleOrArray<{ name: string | null }>) ?? "—",
      summary_id: row.summary_id as string,
      summary_date: summaryRow?.summary_date ?? "",
      text: row.text as string,
    };
  });
}

/** Total de tarefas pendentes atribuídas ao usuário logado (widget da home). */
export async function countMyPendingTasks(): Promise<number> {
  const profile = await getCurrentProfile();
  if (!profile) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", profile.id)
    .in("status", ["pendente", "em_andamento"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type TaskInput = {
  clinicId: string | null;
  title: string;
  description?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  assignedTo: string | null;
  dueDate?: string | null; // YYYY-MM-DD
};

export async function createTask(
  input: TaskInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const title = input.title.trim();
  if (title.length < 3) return { ok: false, error: "Título muito curto" };

  const user = await getSessionUser();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      clinic_id: input.clinicId,
      title,
      description: input.description?.trim() || null,
      category: input.category,
      priority: input.priority,
      assigned_to: input.assignedTo,
      due_date: input.dueDate || null,
      source: "manual",
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  revalidatePath("/");
  if (input.clinicId) revalidatePath(`/clinicas/${input.clinicId}`);
  return { ok: true, id: data.id as string };
}

export async function updateTask(
  id: string,
  input: Partial<TaskInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.category !== undefined) payload.category = input.category;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.assignedTo !== undefined) payload.assigned_to = input.assignedTo;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate || null;
  if (input.clinicId !== undefined) payload.clinic_id = input.clinicId;

  const { error } = await supabase.from("tasks").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  revalidatePath("/");
  return { ok: true };
}

// ── Sugestões: aceitar / descartar ───────────────────────────────────────────

export async function acceptTaskSuggestion(
  suggestionId: string,
  input: Omit<TaskInput, "title"> & { title?: string },
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { data: suggestion, error: fetchError } = await supabase
    .from("task_suggestions")
    .select("id, text, clinic_id, status")
    .eq("id", suggestionId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!suggestion) return { ok: false, error: "Sugestão não encontrada" };
  if (suggestion.status !== "pending") return { ok: false, error: "Sugestão já revisada" };

  const user = await getSessionUser();
  const title = (input.title ?? (suggestion.text as string)).trim().slice(0, 200);

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      clinic_id: input.clinicId ?? (suggestion.clinic_id as string),
      title,
      description: suggestion.text as string,
      category: input.category,
      priority: input.priority,
      assigned_to: input.assignedTo,
      due_date: input.dueDate || null,
      source: "ia",
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (taskError) return { ok: false, error: taskError.message };

  const { error: updateError } = await supabase
    .from("task_suggestions")
    .update({
      status: "accepted",
      task_id: task.id,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user!.id,
    })
    .eq("id", suggestionId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/tarefas");
  revalidatePath("/");
  return { ok: true, taskId: task.id as string };
}

export async function dismissTaskSuggestion(
  suggestionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const user = await getSessionUser();
  const { error } = await supabase
    .from("task_suggestions")
    .update({ status: "dismissed", reviewed_at: new Date().toISOString(), reviewed_by: user!.id })
    .eq("id", suggestionId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  return { ok: true };
}
