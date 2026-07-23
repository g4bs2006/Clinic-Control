"use server"

import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"
import { requireGestor } from "@/lib/auth/require-gestor"
import {
  VAULT_FILES_BUCKET,
  listAllVaultFiles,
  isPathVisibleToDevs,
  type VaultStoredFile,
  type VaultFileMeta,
} from "@/lib/storage/vault-files"

type MetaRow = { path: string; visible_to_devs: boolean; note: string | null }

// Normaliza um caminho relativo (tira barras nas pontas e colapsa duplicadas).
function cleanPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "")
}

// Conjunto de ancestrais (pastas) de um caminho: "a/b/c.pdf" → ["a", "a/b"].
function ancestors(path: string): string[] {
  const parts = path.split("/")
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"))
  return out
}

async function loadMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, VaultFileMeta>> {
  const { data } = await supabase.from("vault_file_meta").select("path, visible_to_devs, note")
  const map = new Map<string, VaultFileMeta>()
  for (const row of (data as MetaRow[] | null) ?? []) {
    map.set(row.path, { visibleToDevs: row.visible_to_devs, note: row.note })
  }
  return map
}

/**
 * Lista arquivos + metadados, com recorte por papel:
 * - gestor vê tudo (arquivos, visibilidade, notas);
 * - desenvolvedor vê só arquivos sob um caminho marcado visible_to_devs (o
 *   próprio arquivo ou uma pasta ancestral), e apenas as notas dos itens que
 *   pode enxergar. A filtragem acontece AQUI (servidor); a UI só reflete.
 */
export async function listVaultFiles(): Promise<
  | { ok: true; files: VaultStoredFile[]; meta: Record<string, VaultFileMeta> }
  | { ok: false; error: string }
> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Não autenticado" }

  const supabase = await createClient()
  const [files, metaMap] = await Promise.all([listAllVaultFiles(supabase), loadMeta(supabase)])

  if (user.role === "gestor") {
    const meta: Record<string, VaultFileMeta> = {}
    for (const [path, m] of metaMap) meta[path] = m
    return { ok: true, files, meta }
  }

  // Desenvolvedor: só o que estiver compartilhado.
  const shared = new Set([...metaMap].filter(([, m]) => m.visibleToDevs).map(([path]) => path))
  const visibleFiles = files.filter((f) => isPathVisibleToDevs(f.path, shared))

  // Notas relevantes = notas dos arquivos visíveis + das pastas ancestrais deles.
  const allowed = new Set<string>()
  for (const f of visibleFiles) {
    allowed.add(f.path)
    for (const a of ancestors(f.path)) allowed.add(a)
  }
  const meta: Record<string, VaultFileMeta> = {}
  for (const path of allowed) {
    const m = metaMap.get(path)
    if (m?.note) meta[path] = { visibleToDevs: false, note: m.note }
  }
  return { ok: true, files: visibleFiles, meta }
}

/**
 * URL assinada de leitura (5 min). Auditoria do download é gate DURO (mesmo
 * espírito de revealSecret): se o log falhar, a URL não sai. Desenvolvedor só
 * baixa arquivo compartilhado com a equipe.
 */
export async function getVaultFileDownloadUrl(
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Não autenticado" }
  const rel = cleanPath(path)
  if (!rel) return { ok: false, error: "Caminho inválido" }

  const supabase = await createClient()

  if (user.role !== "gestor") {
    const metaMap = await loadMeta(supabase)
    const shared = new Set([...metaMap].filter(([, m]) => m.visibleToDevs).map(([p]) => p))
    // Mesma mensagem do não-encontrado: um dev não deve sondar o que existe no cofre restrito.
    if (!isPathVisibleToDevs(rel, shared)) return { ok: false, error: "Arquivo não encontrado" }
  }

  const { error: auditError } = await supabase
    .from("vault_file_access_log")
    .insert({ path: rel, user_id: user.id, action: "download" })
  if (auditError)
    return { ok: false, error: "Download bloqueado: não foi possível registrar no log de auditoria" }

  const { data, error } = await supabase.storage
    .from(VAULT_FILES_BUCKET)
    .createSignedUrl(rel, 300)
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao assinar URL" }
  return { ok: true, url: data.signedUrl }
}

/** URLs assinadas de upload (só gestor). Cada caminho é relativo à raiz do cofre. */
export async function createVaultFileUploadUrls(
  paths: string[],
): Promise<
  | { ok: true; uploads: { path: string; token: string }[] }
  | { ok: false; error: string }
> {
  const gate = await requireGestor()
  if (!gate.ok) return gate
  if (paths.length === 0) return { ok: true, uploads: [] }
  if (paths.length > 500) return { ok: false, error: "Máximo de 500 arquivos por lote" }

  const supabase = await createClient()
  const uploads: { path: string; token: string }[] = []
  for (const raw of paths) {
    const rel = cleanPath(raw)
    if (!rel) return { ok: false, error: `Caminho inválido: ${raw}` }
    const { data, error } = await supabase.storage
      .from(VAULT_FILES_BUCKET)
      .createSignedUploadUrl(rel, { upsert: true })
    if (error || !data) return { ok: false, error: error?.message ?? `Falha ao assinar upload de ${rel}` }
    uploads.push({ path: rel, token: data.token })
  }
  return { ok: true, uploads }
}

// Se a linha de metadado ficou "vazia" (sem nota e não compartilhada), remove
// para não acumular órfãs.
async function pruneMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  await supabase
    .from("vault_file_meta")
    .delete()
    .eq("path", path)
    .eq("visible_to_devs", false)
    .is("note", null)
}

/** Marca/desmarca compartilhamento com a equipe de um arquivo OU pasta (só gestor). */
export async function setVaultVisibility(
  path: string,
  visibleToDevs: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor()
  if (!gate.ok) return gate
  const rel = cleanPath(path)
  if (!rel) return { ok: false, error: "Caminho inválido" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("vault_file_meta")
    .upsert(
      { path: rel, visible_to_devs: visibleToDevs, updated_by: gate.userId },
      { onConflict: "path" },
    )
  if (error) return { ok: false, error: error.message }
  if (!visibleToDevs) await pruneMeta(supabase, rel)
  return { ok: true }
}

/** Salva (texto) ou remove (vazio) a nota de um arquivo OU pasta (só gestor). */
export async function setVaultFileNote(
  path: string,
  note: string,
): Promise<{ ok: true; note: string | null } | { ok: false; error: string }> {
  const gate = await requireGestor()
  if (!gate.ok) return gate
  const rel = cleanPath(path)
  if (!rel) return { ok: false, error: "Caminho inválido" }

  const supabase = await createClient()
  const clean = note.trim()
  const { error } = await supabase
    .from("vault_file_meta")
    .upsert(
      { path: rel, note: clean || null, updated_by: gate.userId },
      { onConflict: "path" },
    )
  if (error) return { ok: false, error: error.message }
  if (!clean) await pruneMeta(supabase, rel)
  return { ok: true, note: clean || null }
}

async function purgeMetaUnder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefix: string,
) {
  const { data } = await supabase.from("vault_file_meta").select("path")
  const under = (data as { path: string }[] | null ?? [])
    .map((r) => r.path)
    .filter((p) => p === prefix || p.startsWith(`${prefix}/`))
  if (under.length) await supabase.from("vault_file_meta").delete().in("path", under)
}

/** Exclui um arquivo (só gestor). */
export async function deleteVaultFile(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor()
  if (!gate.ok) return gate
  const rel = cleanPath(path)
  if (!rel) return { ok: false, error: "Caminho inválido" }

  const supabase = await createClient()
  const { error } = await supabase.storage.from(VAULT_FILES_BUCKET).remove([rel])
  if (error) return { ok: false, error: error.message }
  await supabase.from("vault_file_meta").delete().eq("path", rel)
  return { ok: true }
}

/** Exclui uma pasta inteira (arquivos + metadados sob o prefixo) — só gestor. */
export async function deleteVaultFolder(
  folderPath: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const gate = await requireGestor()
  if (!gate.ok) return gate
  const prefix = cleanPath(folderPath)
  if (!prefix) return { ok: false, error: "Caminho inválido" }

  const supabase = await createClient()
  const files = await listAllVaultFiles(supabase)
  const targets = files.filter((f) => f.path === prefix || f.path.startsWith(`${prefix}/`))
  if (targets.length === 0) {
    await purgeMetaUnder(supabase, prefix)
    return { ok: true, deleted: 0 }
  }
  const { error } = await supabase.storage
    .from(VAULT_FILES_BUCKET)
    .remove(targets.map((f) => f.path))
  if (error) return { ok: false, error: error.message }
  await purgeMetaUnder(supabase, prefix)
  return { ok: true, deleted: targets.length }
}

/** Exclui TODOS os arquivos do cofre (só gestor). */
export async function deleteAllVaultFiles(): Promise<
  { ok: true; deleted: number } | { ok: false; error: string }
> {
  const gate = await requireGestor()
  if (!gate.ok) return gate

  const supabase = await createClient()
  const files = await listAllVaultFiles(supabase)
  if (files.length === 0) return { ok: true, deleted: 0 }
  const { error } = await supabase.storage
    .from(VAULT_FILES_BUCKET)
    .remove(files.map((f) => f.path))
  if (error) return { ok: false, error: error.message }
  // Zera todos os metadados (delete sem filtro exige um predicado sempre-verdadeiro).
  await supabase.from("vault_file_meta").delete().neq("path", "")
  return { ok: true, deleted: files.length }
}
