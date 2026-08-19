"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"
import { clinicNoteInputSchema, clinicDetailInputSchema } from "./notes-schema"
import { canEditNote, canViewNote, type ClinicDetail, type ClinicNote } from "./notes"

type SingleOrArray<T> = T | T[] | null
function unwrapName(rel: SingleOrArray<{ name: string | null }>): string | null {
  if (!rel) return null
  const one = Array.isArray(rel) ? rel[0] : rel
  return one?.name ?? null
}

const NOTE_SELECT =
  "id, clinic_id, body, author_id, is_private, pinned_at, created_at, updated_at, author:app_users!author_id(name)"

const DETAIL_SELECT = "id, clinic_id, label, value, position"

type Row = Record<string, unknown>

function toNote(row: Row): ClinicNote {
  return {
    id: row.id as string,
    clinic_id: row.clinic_id as string,
    body: row.body as string,
    author_id: row.author_id as string | null,
    author_name: unwrapName(row.author as SingleOrArray<{ name: string | null }>),
    is_private: row.is_private as boolean,
    pinned_at: row.pinned_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function toDetail(row: Row): ClinicDetail {
  return {
    id: row.id as string,
    clinic_id: row.clinic_id as string,
    label: row.label as string,
    value: row.value as string | null,
    position: row.position as number,
  }
}

function revalidate(clinicId: string) {
  revalidatePath(`/clinicas/${clinicId}/cadastro`)
}

// ── Anotações ────────────────────────────────────────────────────────────────

/**
 * Anotações visíveis para quem está pedindo: as compartilhadas da clínica mais
 * as privadas do próprio usuário. O filtro sai de `canViewNote` (notes.ts) e é
 * aplicado em JS depois do select — de propósito: um `.or()` no PostgREST erra
 * calado quando o `viewerId` é null, e aqui não existe RLS para segurar a queda.
 * O volume é de dezenas de linhas por clínica; não vale o risco.
 *
 * Ordem: fixadas no topo (mais recentes primeiro), depois o resto por data
 * decrescente — a mesma do índice `clinic_notes_clinic_idx`.
 */
export async function listClinicNotes(clinicId: string): Promise<ClinicNote[]> {
  const user = await getSessionUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clinic_notes")
    .select(NOTE_SELECT)
    .eq("clinic_id", clinicId)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return (data as Row[])
    .filter((row) =>
      canViewNote(
        { author_id: row.author_id as string | null, is_private: row.is_private as boolean },
        user?.id ?? null,
      ),
    )
    .map(toNote)
}

export async function createClinicNote(
  clinicId: string,
  input: { body: string; is_private: boolean },
): Promise<{ ok: true; note: ClinicNote } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Não autenticado" }

  const parsed = clinicNoteInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Anotação inválida" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clinic_notes")
    .insert({
      clinic_id: clinicId,
      body: parsed.data.body,
      is_private: parsed.data.is_private,
      author_id: user.id,
    })
    .select(NOTE_SELECT)
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao salvar anotação" }

  revalidate(clinicId)
  return { ok: true, note: toNote(data as Row) }
}

/**
 * Busca a anotação e checa permissão de escrita antes de qualquer mutação.
 * Devolve "não encontrada" também quando a pessoa não pode mexer: responder
 * "sem permissão" já confirmaria que existe uma privada de outra pessoa ali.
 */
async function loadEditable(noteId: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Não autenticado" }

  const supabase = await createClient()
  const { data } = await supabase
    .from("clinic_notes")
    .select("id, clinic_id, author_id, is_private")
    .eq("id", noteId)
    .maybeSingle()
  if (!data) return { ok: false as const, error: "Anotação não encontrada" }

  const row = data as Row
  const note = {
    author_id: row.author_id as string | null,
    is_private: row.is_private as boolean,
  }
  if (!canEditNote(note, user.id)) return { ok: false as const, error: "Anotação não encontrada" }

  return { ok: true as const, supabase, clinicId: row.clinic_id as string }
}

export async function updateClinicNote(
  noteId: string,
  input: { body: string; is_private: boolean },
): Promise<{ ok: true; note: ClinicNote } | { ok: false; error: string }> {
  const gate = await loadEditable(noteId)
  if (!gate.ok) return gate

  const parsed = clinicNoteInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Anotação inválida" }
  }

  const { data, error } = await gate.supabase
    .from("clinic_notes")
    .update({
      body: parsed.data.body,
      is_private: parsed.data.is_private,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select(NOTE_SELECT)
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao salvar anotação" }

  revalidate(gate.clinicId)
  return { ok: true, note: toNote(data as Row) }
}

/** Fixa/desafixa — mesmo eixo do pin de tarefa (0073): foco, não prioridade. */
export async function toggleClinicNotePin(
  noteId: string,
  pinned: boolean,
): Promise<{ ok: true; pinned_at: string | null } | { ok: false; error: string }> {
  const gate = await loadEditable(noteId)
  if (!gate.ok) return gate

  const pinnedAt = pinned ? new Date().toISOString() : null
  const { error } = await gate.supabase
    .from("clinic_notes")
    .update({ pinned_at: pinnedAt })
    .eq("id", noteId)
  if (error) return { ok: false, error: error.message }

  revalidate(gate.clinicId)
  return { ok: true, pinned_at: pinnedAt }
}

export async function deleteClinicNote(
  noteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await loadEditable(noteId)
  if (!gate.ok) return gate

  const { error } = await gate.supabase.from("clinic_notes").delete().eq("id", noteId)
  if (error) return { ok: false, error: error.message }

  revalidate(gate.clinicId)
  return { ok: true }
}

// ── Detalhes (campos livres chave/valor) ─────────────────────────────────────

export async function listClinicDetails(clinicId: string): Promise<ClinicDetail[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clinic_details")
    .select(DETAIL_SELECT)
    .eq("clinic_id", clinicId)
    .order("position")
    .order("label")
  if (error || !data) return []
  return (data as Row[]).map(toDetail)
}

/**
 * Labels já usados em QUALQUER clínica, do mais comum para o menos.
 *
 * É o antídoto do campo livre: sem sugestão, o mesmo dado vira "Horário contato"
 * numa clínica e "Horário de contato" na outra, e comparar as duas depois fica
 * impossível. A tela oferece a lista ao digitar; ninguém é obrigado a escolher.
 */
export async function listClinicDetailLabels(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("clinic_details").select("label")
  if (error || !data) return []

  const counts = new Map<string, number>()
  for (const row of data as Row[]) {
    const label = row.label as string
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([label]) => label)
}

/**
 * Cria ou atualiza um campo. `previousLabel` distingue os dois casos que a tela
 * produz: renomear o rótulo de uma linha existente (vem preenchido) e adicionar
 * uma linha nova (vem vazio). Sem ele, renomear criaria uma segunda linha e a
 * antiga ficaria órfã.
 */
export async function setClinicDetail(
  clinicId: string,
  input: { label: string; value: string },
  previousLabel?: string,
): Promise<{ ok: true; detail: ClinicDetail } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }

  const parsed = clinicDetailInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Campo inválido" }
  }
  const { label, value } = parsed.data
  const supabase = await createClient()

  if (previousLabel && previousLabel !== label) {
    const { data, error } = await supabase
      .from("clinic_details")
      .update({ label, value: value || null, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .eq("label", previousLabel)
      .select(DETAIL_SELECT)
      .maybeSingle()
    if (error) {
      if (error.code === "23505") return { ok: false, error: `Já existe um campo "${label}"` }
      return { ok: false, error: error.message }
    }
    if (data) {
      revalidate(clinicId)
      return { ok: true, detail: toDetail(data as Row) }
    }
    // A linha antiga sumiu no caminho (outra aba apagou) — segue como inserção.
  }

  // Posição do campo novo: no fim da lista atual.
  const { data: last } = await supabase
    .from("clinic_details")
    .select("position")
    .eq("clinic_id", clinicId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (((last as Row | null)?.position as number | undefined) ?? -1) + 1

  const { data, error } = await supabase
    .from("clinic_details")
    .upsert(
      {
        clinic_id: clinicId,
        label,
        value: value || null,
        position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id,label" },
    )
    .select(DETAIL_SELECT)
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao salvar campo" }

  revalidate(clinicId)
  return { ok: true, detail: toDetail(data as Row) }
}

export async function deleteClinicDetail(
  detailId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  const supabase = await createClient()

  const { data } = await supabase
    .from("clinic_details")
    .select("clinic_id")
    .eq("id", detailId)
    .maybeSingle()
  if (!data) return { ok: false, error: "Campo não encontrado" }

  const { error } = await supabase.from("clinic_details").delete().eq("id", detailId)
  if (error) return { ok: false, error: error.message }

  revalidate((data as Row).clinic_id as string)
  return { ok: true }
}

/** Reordena: grava a posição de cada id na ordem em que vierem. */
export async function reorderClinicDetails(
  clinicId: string,
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  const supabase = await createClient()

  for (const [index, id] of ids.entries()) {
    const { error } = await supabase
      .from("clinic_details")
      .update({ position: index })
      .eq("id", id)
      .eq("clinic_id", clinicId)
    if (error) return { ok: false, error: error.message }
  }

  revalidate(clinicId)
  return { ok: true }
}
