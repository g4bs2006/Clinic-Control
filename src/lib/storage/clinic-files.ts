import type { SupabaseClient } from "@supabase/supabase-js"

export const CLINIC_FILES_BUCKET = "clinic-files"

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
export async function listAllFiles(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<StoredFile[]> {
  const out: StoredFile[] = []

  async function walk(prefix: string) {
    const { data, error } = await supabase.storage
      .from(CLINIC_FILES_BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } })
    if (error || !data) return
    for (const item of data) {
      if (item.name === ".emptyFolderPlaceholder") continue
      const full = `${prefix}/${item.name}`
      // Pastas vêm com id null; arquivos têm id.
      if (item.id === null) {
        await walk(full)
      } else {
        out.push({
          fullPath: full,
          path: full.slice(clinicId.length + 1),
          name: item.name,
          size: (item.metadata?.size as number) ?? 0,
        })
      }
    }
  }

  await walk(clinicId)
  return out
}
