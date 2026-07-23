"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";
import { listClinics } from "@/lib/clinics/actions";
import { TASK_ATTACHMENTS_BUCKET } from "@/lib/tasks/categories";
import { notifyAcompanhamentoAssigned } from "@/lib/notifications/task-events";

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

/** Escopo de carteira ativa (mesma regra das tarefas). `clinicIds=null` = sem
 *  restrição; `filter` é o dev da carteira, usado no "OR" de atribuídos. */
async function carteiraScope(): Promise<{ filter: string | null; clinicIds: string[] | null }> {
  const scope = await getCarteiraScope();
  if (!scope.developerFilter) return { filter: null, clinicIds: null };
  const clinics = await listClinics();
  const clinicIds = clinics.filter((c) => c.developer_id === scope.developerFilter).map((c) => c.id);
  return { filter: scope.developerFilter, clinicIds };
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
  const { filter, clinicIds } = await carteiraScope();

  let query = supabase.from("acompanhamentos").select(SELECT);
  if (clinicIds !== null) {
    const devId = filter as string;
    query = clinicIds.length
      ? query.or(`assigned_to.eq.${devId},clinic_id.in.(${clinicIds.join(",")})`)
      : query.eq("assigned_to", devId);
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

  await notifyAcompanhamentoAssigned({
    acompanhamentoId: data.id as string,
    title,
    assigneeId: input.assignedTo ?? null,
    actor: { id: user!.id, name: user!.name },
  });

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

  // Sem responsável explícito → assume o desenvolvedor da clínica (carteira).
  let assignee = input?.assignedTo ?? null;
  if (input?.assignedTo === undefined && s.clinic_id) {
    const { data: clinic } = await supabase
      .from("clinics")
      .select("developer_id")
      .eq("id", s.clinic_id as string)
      .maybeSingle();
    assignee = (clinic?.developer_id as string | null) ?? null;
  }

  const { data: created, error: ce } = await supabase
    .from("acompanhamentos")
    .insert({
      clinic_id: s.clinic_id as string,
      summary_id: (s.summary_id as string | null) ?? null,
      title: (s.text as string).slice(0, 200),
      description: (s.description as string | null) ?? null,
      severity: (s.severity as "baixa" | "media" | "alta") ?? "media",
      assigned_to: assignee,
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

  await notifyAcompanhamentoAssigned({
    acompanhamentoId: created.id as string,
    title: (s.text as string).slice(0, 200),
    assigneeId: assignee,
    actor: { id: user!.id, name: user!.name },
  });

  revalidatePath("/acompanhamentos");
  revalidatePath("/tarefas");
  return { ok: true, id: created.id as string };
}

// ── Detalhe: comentários + anexos ────────────────────────────────────────────

export type AcompanhamentoComment = {
  id: string;
  body: string;
  kind: "comment" | "system";
  author_name: string | null;
  created_at: string;
};

export type AcompanhamentoAttachment = {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export async function listAcompanhamentoComments(id: string): Promise<AcompanhamentoComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acompanhamento_comments")
    .select("id, body, kind, created_at, author:app_users!author_id(name)")
    .eq("acompanhamento_id", id)
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

export async function addAcompanhamentoComment(
  id: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const text = body.trim();
  if (!text) return { ok: false, error: "Comentário vazio" };
  const user = await getSessionUser();
  const { error } = await supabase
    .from("acompanhamento_comments")
    .insert({ acompanhamento_id: id, author_id: user!.id, body: text, kind: "comment" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/acompanhamentos");
  return { ok: true };
}

export async function listAcompanhamentoAttachments(id: string): Promise<AcompanhamentoAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acompanhamento_attachments")
    .select("id, file_path, file_name, content_type, size_bytes, created_at, uploader:app_users!uploaded_by(name)")
    .eq("acompanhamento_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    file_path: row.file_path as string,
    file_name: row.file_name as string,
    content_type: (row.content_type as string | null) ?? null,
    size_bytes: (row.size_bytes as number | null) ?? null,
    uploaded_by_name: unwrapName(row.uploader as SingleOrArray<{ name: string | null }>),
    created_at: row.created_at as string,
  }));
}

/** URL assinada de upload (bucket compartilhado task-attachments, prefixo acomp/). */
export async function createAcompanhamentoAttachmentUploadUrl(
  id: string,
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const path = `acomp/${id}/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage
    .from(TASK_ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao assinar upload" };
  return { ok: true, path, token: data.token };
}

export async function confirmAcompanhamentoAttachment(input: {
  acompanhamentoId: string;
  filePath: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const user = await getSessionUser();
  const { error } = await supabase.from("acompanhamento_attachments").insert({
    acompanhamento_id: input.acompanhamentoId,
    file_path: input.filePath,
    file_name: input.fileName,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    uploaded_by: user!.id,
  });
  if (error) return { ok: false, error: error.message };
  await supabase.from("acompanhamento_comments").insert({
    acompanhamento_id: input.acompanhamentoId,
    author_id: user!.id,
    kind: "system",
    body: `Anexou o arquivo "${input.fileName}"`,
  });
  revalidatePath("/acompanhamentos");
  return { ok: true };
}

export async function getAcompanhamentoAttachmentUrl(
  attachmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: att, error: fe } = await supabase
    .from("acompanhamento_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (fe) return { ok: false, error: fe.message };
  if (!att) return { ok: false, error: "Anexo não encontrado" };
  const { data, error } = await supabase.storage
    .from(TASK_ATTACHMENTS_BUCKET)
    .createSignedUrl(att.file_path as string, 300);
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao gerar link" };
  return { ok: true, url: data.signedUrl };
}

export async function deleteAcompanhamentoAttachment(
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const { data: att } = await supabase
    .from("acompanhamento_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (att) {
    await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([att.file_path as string]);
  }
  const { error } = await supabase.from("acompanhamento_attachments").delete().eq("id", attachmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/acompanhamentos");
  return { ok: true };
}
