import type { SupabaseClient } from "@supabase/supabase-js"
import { mapLimit, STORAGE_CONCURRENCY } from "./map-limit"

export const CLINIC_FILES_BUCKET = "clinic-files"

// Chaves do Supabase Storage não aceitam acentos/caracteres especiais
// (ex.: "Consultório" → "Invalid key"). Normaliza cada segmento: remove
// diacríticos e troca o que não for [A-Za-z0-9 ._-] por "_". Preserva as "/".
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g")

export function toStorageKey(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      seg
        .normalize("NFD")
        .replace(DIACRITICS, "")
        .replace(/[^A-Za-z0-9 ._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .trim(),
    )
    .join("/")
}

export type StoredFile = {
  /** Caminho completo no bucket: "<clinicId>/<relativo>" */
  fullPath: string
  /** Caminho relativo à clínica (sem o prefixo do id) */
  path: string
  name: string
  size: number
}

// Lista recursiva de todos os arquivos sob "<clinicId>/" (Supabase Storage
// lista só um nível por chamada, então descemos nas subpastas).
//
// As subpastas de um mesmo nível são visitadas EM PARALELO: cada .list() é uma
// ida e volta de rede, e descer uma pasta por vez fazia o tempo crescer com a
// profundidade da árvore, não com o tamanho dos arquivos.
export async function listAllFiles(
  // schema-agnostic: só usa .storage (independe do schema do banco)
  supabase: Pick<SupabaseClient, "storage">,
  clinicId: string,
): Promise<StoredFile[]> {
  const out: StoredFile[] = []

  async function walk(prefix: string) {
    const { data, error } = await supabase.storage
      .from(CLINIC_FILES_BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } })
    if (error || !data) return

    const folders: string[] = []
    for (const item of data) {
      if (item.name === ".emptyFolderPlaceholder") continue
      const full = `${prefix}/${item.name}`
      // Pastas vêm com id null; arquivos têm id.
      if (item.id === null) {
        folders.push(full)
      } else {
        out.push({
          fullPath: full,
          path: full.slice(clinicId.length + 1),
          name: item.name,
          size: (item.metadata?.size as number) ?? 0,
        })
      }
    }
    await mapLimit(folders, STORAGE_CONCURRENCY, walk)
  }

  await walk(clinicId)
  return out
}
