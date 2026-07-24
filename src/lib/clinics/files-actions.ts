"use server"

import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"
import {
  CLINIC_FILES_BUCKET,
  listAllFiles,
  type StoredFile,
} from "@/lib/storage/clinic-files"

export async function listClinicFiles(clinicId: string): Promise<StoredFile[]> {
  const supabase = await createClient()
  try {
    return await listAllFiles(supabase, clinicId)
  } catch {
    return []
  }
}

// ── Anotações em pastas/arquivos (indexadas pelo caminho relativo) ────────────

/** Mapa caminho → nota de todas as anotações da clínica. */
export async function listClinicFileNotes(clinicId: string): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clinic_file_notes")
    .select("path, note")
    .eq("clinic_id", clinicId)
  if (error || !data) return {}
  const out: Record<string, string> = {}
  for (const row of data) out[row.path as string] = row.note as string
  return out
}

/**
 * Salva (upsert) ou remove (nota vazia) a anotação de um caminho — pasta ou
 * arquivo. Retorna a nota final (null = removida) para o cliente reconciliar.
 */
export async function setClinicFileNote(
  clinicId: string,
  path: string,
  note: string,
): Promise<{ ok: true; note: string | null } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Não autenticado" }
  const supabase = await createClient()

  const clean = note.trim()
  if (!clean) {
    const { error } = await supabase
      .from("clinic_file_notes")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("path", path)
    if (error) return { ok: false, error: error.message }
    return { ok: true, note: null }
  }

  const { error } = await supabase
    .from("clinic_file_notes")
    .upsert(
      { clinic_id: clinicId, path, note: clean, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: "clinic_id,path" },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true, note: clean }
}

// Sem Supabase Auth o navegador não tem mais papel `authenticated` no Storage —
// download e upload passam por URLs assinadas geradas aqui (service role).

/** URL assinada de leitura (5 min) para visualizar/baixar um arquivo. */
export async function getClinicFileDownloadUrl(
  clinicId: string,
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  const fullPath = `${clinicId}/${path}`.replace(/\/{2,}/g, "/")
  if (!fullPath.startsWith(`${clinicId}/`)) return { ok: false, error: "Caminho inválido" }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(CLINIC_FILES_BUCKET)
    .createSignedUrl(fullPath, 300)
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao assinar URL" }
  return { ok: true, url: data.signedUrl }
}

/** URLs assinadas de upload (2h) para um lote de caminhos relativos à clínica. */
export async function createClinicFileUploadUrls(
  clinicId: string,
  paths: string[],
): Promise<
  | { ok: true; uploads: { path: string; fullPath: string; token: string }[] }
  | { ok: false; error: string }
> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  if (paths.length === 0) return { ok: true, uploads: [] }
  if (paths.length > 500) return { ok: false, error: "Máximo de 500 arquivos por lote" }

  const supabase = await createClient()
  const uploads: { path: string; fullPath: string; token: string }[] = []
  for (const path of paths) {
    const fullPath = `${clinicId}/${path}`.replace(/\/{2,}/g, "/")
    if (!fullPath.startsWith(`${clinicId}/`)) return { ok: false, error: `Caminho inválido: ${path}` }
    const { data, error } = await supabase.storage
      .from(CLINIC_FILES_BUCKET)
      .createSignedUploadUrl(fullPath, { upsert: true })
    if (error || !data) return { ok: false, error: error?.message ?? `Falha ao assinar upload de ${path}` }
    uploads.push({ path, fullPath, token: data.token })
  }
  return { ok: true, uploads }
}

// Exclui um arquivo do repositório da clínica. `path` é relativo à clínica.
export async function deleteClinicFile(
  clinicId: string,
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  const supabase = await createClient()

  // Garante que o caminho está dentro da clínica (evita apagar fora do escopo).
  const fullPath = `${clinicId}/${path}`.replace(/\/{2,}/g, "/")
  if (!fullPath.startsWith(`${clinicId}/`)) {
    return { ok: false, error: "Caminho inválido" }
  }

  const { error } = await supabase.storage
    .from(CLINIC_FILES_BUCKET)
    .remove([fullPath])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Exclui uma PASTA específica (todos os arquivos sob o prefixo) + as anotações
// da pasta e de seus descendentes. `folderPath` é relativo à clínica.
export async function deleteClinicFolder(
  clinicId: string,
  folderPath: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  const prefix = folderPath.replace(/^\/+|\/+$/g, "")
  if (!prefix) return { ok: false, error: "Caminho inválido" }
  const supabase = await createClient()

  const files = await listAllFiles(supabase, clinicId)
  const targets = files.filter((f) => f.path === prefix || f.path.startsWith(`${prefix}/`))
  if (targets.length === 0) return { ok: true, deleted: 0 }

  const { error } = await supabase.storage
    .from(CLINIC_FILES_BUCKET)
    .remove(targets.map((f) => f.fullPath))
  if (error) return { ok: false, error: error.message }

  // Limpa as anotações órfãs (filtra em JS para não escapar filtro do PostgREST).
  const { data: noteRows } = await supabase
    .from("clinic_file_notes")
    .select("path")
    .eq("clinic_id", clinicId)
  const orphanPaths = (noteRows ?? [])
    .map((r) => r.path as string)
    .filter((p) => p === prefix || p.startsWith(`${prefix}/`))
  if (orphanPaths.length) {
    await supabase.from("clinic_file_notes").delete().eq("clinic_id", clinicId).in("path", orphanPaths)
  }

  return { ok: true, deleted: targets.length }
}

// Exclui TODOS os arquivos do repositório da clínica.
export async function deleteAllClinicFiles(
  clinicId: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" }
  const supabase = await createClient()

  const files = await listAllFiles(supabase, clinicId)
  if (files.length === 0) return { ok: true, deleted: 0 }

  const { error } = await supabase.storage
    .from(CLINIC_FILES_BUCKET)
    .remove(files.map((f) => f.fullPath))
  if (error) return { ok: false, error: error.message }
  return { ok: true, deleted: files.length }
}
