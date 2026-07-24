import type { SupabaseClient } from "@supabase/supabase-js"
// Normalização de chave é idêntica à do repositório de clínicas (remove
// acentos/caracteres inválidos, preserva "/") — reaproveitada para não divergir.
export { toStorageKey } from "@/lib/storage/clinic-files"

export const VAULT_FILES_BUCKET = "vault-files"

export type VaultStoredFile = {
  /** Caminho relativo no bucket ("Pasta/Sub/arquivo.pdf"). É também a chave completa (cofre é global, sem prefixo). */
  path: string
  name: string
  size: number
}

/** Metadado por caminho (arquivo ou pasta). Mora aqui (e não nas actions) porque
 *  módulos "use server" só podem exportar funções. */
export type VaultFileMeta = { visibleToDevs: boolean; note: string | null }

// Lista recursiva de todos os arquivos do bucket (Supabase Storage lista só um
// nível por chamada, então descemos nas subpastas). Diferente do clinic-files,
// aqui a raiz é "" (não há prefixo de clínica).
export async function listAllVaultFiles(
  supabase: Pick<SupabaseClient, "storage">,
): Promise<VaultStoredFile[]> {
  const out: VaultStoredFile[] = []

  async function walk(prefix: string) {
    const { data, error } = await supabase.storage
      .from(VAULT_FILES_BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } })
    if (error || !data) return
    for (const item of data) {
      if (item.name === ".emptyFolderPlaceholder") continue
      const full = prefix ? `${prefix}/${item.name}` : item.name
      // Pastas vêm com id null; arquivos têm id.
      if (item.id === null) {
        await walk(full)
      } else {
        out.push({
          path: full,
          name: item.name,
          size: (item.metadata?.size as number) ?? 0,
        })
      }
    }
  }

  await walk("")
  return out
}

/**
 * Conjunto de caminhos marcados visible_to_devs pode conter tanto arquivos
 * (match exato) quanto pastas (prefixo). Um caminho de arquivo é visível para a
 * equipe se bater exatamente com um caminho compartilhado OU estiver sob uma
 * pasta compartilhada.
 */
export function isPathVisibleToDevs(filePath: string, sharedPaths: Set<string>): boolean {
  if (sharedPaths.has(filePath)) return true
  for (const shared of sharedPaths) {
    if (filePath.startsWith(`${shared}/`)) return true
  }
  return false
}
