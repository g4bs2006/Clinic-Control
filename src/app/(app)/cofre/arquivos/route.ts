import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"
import { loadSharedPaths } from "@/lib/vault/shared-paths"
import { mapLimit, STORAGE_CONCURRENCY } from "@/lib/storage/map-limit"
import {
  VAULT_FILES_BUCKET,
  listAllVaultFiles,
  isPathVisibleToDevs,
} from "@/lib/storage/vault-files"

// GET /cofre/arquivos → baixa os arquivos do cofre num .zip.
// ?path=<pasta> restringe a uma subpasta. Desenvolvedor só recebe o que foi
// compartilhado com a equipe; gestor recebe tudo. Cada download é auditado.
//
// O gargalo aqui é LATÊNCIA, não tamanho: o Storage cobra uma ida e volta por
// arquivo, e o cofre tem centenas de .md minúsculos (267 arquivos / 561 kB em
// 2026-07-28). Em série isso passava de um minuto e a função morria no limite
// de tempo — o navegador ficava pendurado numa navegação que nunca respondia.
export const maxDuration = 60

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return new Response("Não autorizado", { status: 401 })
  const supabase = await createClient()

  const folder = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "")

  try {
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

    // Downloads em lote. A ordem do zip não importa, mas mapLimit preserva a
    // dos arquivos, o que mantém o .zip estável entre execuções.
    const zip = new JSZip()
    const blobs = await mapLimit(files, STORAGE_CONCURRENCY, async (f) => {
      const { data } = await supabase.storage.from(VAULT_FILES_BUCKET).download(f.path)
      return { path: f.path, buf: data ? await data.arrayBuffer() : null }
    })
    for (const b of blobs) if (b.buf) zip.file(b.path, b.buf)

    const baseName = folder ? folder.split("/").pop() || "arquivos" : "cofre"
    const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, "_")
    const buf = await zip.generateAsync({ type: "nodebuffer" })
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      },
    })
  } catch (e) {
    // Sem isto, uma falha aqui vira página em branco e ninguém sabe o motivo.
    const message = e instanceof Error ? e.message : "erro desconhecido"
    return new Response(`Falha ao montar o .zip: ${message}`, { status: 500 })
  }
}
