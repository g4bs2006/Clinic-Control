"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/users/actions";
import { listClinics } from "@/lib/clinics/actions";
import { TASK_STATUS_LABEL, TASK_ATTACHMENTS_BUCKET, type TaskCategory, type TaskPriority, type TaskStatus } from "./categories";

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
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const TASK_SELECT =
  "id, clinic_id, title, description, category, priority, status, assigned_to, due_date, source, parent_task_id, created_at, updated_at, completed_at, clinics(name), assignee:app_users!assigned_to(name)";

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
    parent_task_id: row.parent_task_id as string | null,
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

  let query = supabase.from("tasks").select(TASK_SELECT).is("parent_task_id", null);

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
    .select(TASK_SELECT)
    .eq("clinic_id", clinicId)
    .is("parent_task_id", null)
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

  const { data: current } = await supabase.from("tasks").select("status").eq("id", id).maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (current && current.status !== status) {
    const user = await getSessionUser();
    await supabase.from("task_comments").insert({
      task_id: id,
      author_id: user!.id,
      kind: "system",
      body: `Status alterado de "${TASK_STATUS_LABEL[current.status as TaskStatus]}" para "${TASK_STATUS_LABEL[status]}"`,
    });
  }

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

// ── Detalhe de uma tarefa (subtarefas, anexos, atividade) ────────────────────

export async function getTask(id: string): Promise<TaskRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTaskRow(data) : null;
}

/** Subtarefas (tasks filhas) de uma tarefa. */
export async function listSubtasks(parentTaskId: string): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("parent_task_id", parentTaskId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTaskRow);
}

/** Cria uma ou mais subtarefas reais, herdando clínica/categoria da tarefa mãe. */
export async function createSubtasks(
  parentTaskId: string,
  titles: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const clean = titles.map((t) => t.trim()).filter((t) => t.length >= 3);
  if (!clean.length) return { ok: false, error: "Nenhum título válido" };

  const { data: parent, error: parentError } = await supabase
    .from("tasks")
    .select("clinic_id, category")
    .eq("id", parentTaskId)
    .maybeSingle();
  if (parentError) return { ok: false, error: parentError.message };
  if (!parent) return { ok: false, error: "Tarefa não encontrada" };

  const user = await getSessionUser();
  const { error } = await supabase.from("tasks").insert(
    clean.map((title) => ({
      parent_task_id: parentTaskId,
      clinic_id: parent.clinic_id,
      category: parent.category,
      title,
      priority: "media",
      source: "ia" as const,
      created_by: user!.id,
    })),
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  return { ok: true };
}

/**
 * Pede ao DeepSeek para quebrar uma descrição livre em subtarefas menores.
 * Não persiste nada — retorna a lista pra revisão antes de criar de verdade.
 */
export async function suggestSubtasks(
  description: string,
): Promise<{ ok: true; titles: string[] } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };

  const text = description.trim();
  if (text.length < 10) return { ok: false, error: "Descreva a tarefa com mais detalhes" };

  const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "DEEPSEEK_API_KEY não configurada no servidor" };
  const model = (process.env.LLM_MODEL ?? "deepseek-chat").trim();
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com").trim().replace(/\/+$/, "");

  const prompt =
    `Divida a tarefa abaixo em uma lista de subtarefas menores, objetivas e acionáveis ` +
    `(3 a 8 itens, cada uma um passo concreto). Responda em JSON: {"subtarefas": ["...", "..."]}.\n\n` +
    `Tarefa: ${text}`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    if (!res.ok) return { ok: false, error: `IA respondeu ${res.status}` };
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const titles = Array.isArray(parsed.subtarefas)
      ? parsed.subtarefas.filter((t: unknown): t is string => typeof t === "string" && t.trim().length >= 3)
      : [];
    if (!titles.length) return { ok: false, error: "IA não retornou subtarefas válidas" };
    return { ok: true, titles: titles.slice(0, 10) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao consultar IA" };
  }
}

// ── Anexos ───────────────────────────────────────────────────────────────────

export type TaskAttachmentRow = {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export async function listTaskAttachments(taskId: string): Promise<TaskAttachmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_attachments")
    .select("id, file_path, file_name, content_type, size_bytes, created_at, uploader:app_users!uploaded_by(name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    file_path: row.file_path as string,
    file_name: row.file_name as string,
    content_type: row.content_type as string | null,
    size_bytes: row.size_bytes as number | null,
    uploaded_by_name: unwrapName(row.uploader as SingleOrArray<{ name: string | null }>),
    created_at: row.created_at as string,
  }));
}

/** URL assinada de upload (1h) para um anexo — o cliente sobe o arquivo direto pro Storage. */
export async function createTaskAttachmentUploadUrl(
  taskId: string,
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const path = `${taskId}/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage
    .from(TASK_ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao assinar upload" };
  return { ok: true, path, token: data.token };
}

/** Registra o anexo no banco depois que o upload pro Storage já terminou. */
export async function confirmTaskAttachment(input: {
  taskId: string;
  filePath: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const user = await getSessionUser();
  const { error } = await supabase.from("task_attachments").insert({
    task_id: input.taskId,
    file_path: input.filePath,
    file_name: input.fileName,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    uploaded_by: user!.id,
  });
  if (error) return { ok: false, error: error.message };

  await supabase.from("task_comments").insert({
    task_id: input.taskId,
    author_id: user!.id,
    kind: "system",
    body: `Anexou o arquivo "${input.fileName}"`,
  });

  revalidatePath("/tarefas");
  return { ok: true };
}

export async function getTaskAttachmentUrl(
  attachmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: attachment, error: fetchError } = await supabase
    .from("task_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!attachment) return { ok: false, error: "Anexo não encontrado" };

  const { data, error } = await supabase.storage
    .from(TASK_ATTACHMENTS_BUCKET)
    .createSignedUrl(attachment.file_path as string, 300);
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao gerar link" };
  return { ok: true, url: data.signedUrl };
}

export async function deleteTaskAttachment(
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { data: attachment, error: fetchError } = await supabase
    .from("task_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (attachment) {
    await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([attachment.file_path as string]);
  }

  const { error } = await supabase.from("task_attachments").delete().eq("id", attachmentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  return { ok: true };
}

// ── Comentários e atividade ──────────────────────────────────────────────────

export type TaskActivityRow = {
  id: string;
  body: string;
  kind: "comment" | "system";
  author_name: string | null;
  created_at: string;
};

export async function listTaskActivity(taskId: string): Promise<TaskActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_comments")
    .select("id, body, kind, created_at, author:app_users!author_id(name)")
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    body: row.body as string,
    kind: row.kind as "comment" | "system",
    author_name: unwrapName(row.author as SingleOrArray<{ name: string | null }>),
    created_at: row.created_at as string,
  }));
}

export async function addTaskComment(
  taskId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const text = body.trim();
  if (!text) return { ok: false, error: "Comentário vazio" };

  const user = await getSessionUser();
  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    author_id: user!.id,
    body: text,
    kind: "comment",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  return { ok: true };
}
