import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"
import { loadSharedPaths } from "@/lib/vault/shared-paths"
import {
  VAULT_FILES_BUCKET,
  listAllVaultFiles,
  isPathVisibleToDevs,
} from "@/lib/storage/vault-files"

// GET /cofre/arquivos → baixa os arquivos do cofre num .zip.
// ?path=<pasta> restringe a uma subpasta. Desenvolvedor só recebe o que foi
// compartilhado com a equipe; gestor recebe tudo. Cada download é auditado.
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return new Response("Não autorizado", { status: 401 })
  const supabase = await createClient()

  const folder = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "")

  let files = await listAllVaultFiles(supabase)
  if (folder) files = files.filter((f) => f.path === folder || f.path.startsWith(`${folder}/`))

  if (user.role !== "gestor") {
    const shared = await loadSharedPaths(supabase)
    files = files.filter((f) => isPathVisibleToDevs(f.path, shared))
  }
  if (!files.length) return new Response("Nenhum arquivo", { status: 404 })

  await supabase
    .from("vault_file_access_log")
    .insert({ path: folder || "(tudo)", user_id: user.id, action: "download_zip" })

  const zip = new JSZip()
  for (const f of files) {
    const { data } = await supabase.storage.from(VAULT_FILES_BUCKET).download(f.path)
    if (data) zip.file(f.path, await data.arrayBuffer())
  }

  const baseName = folder ? folder.split("/").pop() || "arquivos" : "cofre"
  const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, "_")
  const buf = await zip.generateAsync({ type: "nodebuffer" })
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
    },
  })
}
