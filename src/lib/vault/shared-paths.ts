import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Conjunto de caminhos (arquivo ou pasta) marcados visible_to_devs — usado para
 * resolver o que a equipe pode ver/baixar. Compartilhado entre a rota de zip e
 * as Server Actions do cofre de arquivos.
 */
export async function loadSharedPaths(
  supabase: Pick<SupabaseClient, "from">,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("vault_file_meta")
    .select("path")
    .eq("visible_to_devs", true)
  return new Set((data as { path: string }[] | null ?? []).map((r) => r.path))
}
