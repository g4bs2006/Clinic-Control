import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"
import { mapLimit, STORAGE_CONCURRENCY } from "@/lib/storage/map-limit"
import {
  CLINIC_FILES_BUCKET,
  listAllFiles,
} from "@/lib/storage/clinic-files"

// GET /clinicas/<id>/arquivos → baixa os arquivos da clínica num .zip.
// ?path=<pasta> restringe a uma subpasta (baixa só ela e seu conteúdo).
//
// Mesmo desenho (e mesmo motivo) do /cofre/arquivos: o custo é uma ida e volta
// por arquivo, então os downloads vão em lote e a rota tem tempo declarado.
export const maxDuration = 60

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!(await getSessionUser())) return new Response("Não autorizado", { status: 401 })
  const supabase = await createClient()

  const folder = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "")

  try {
    let files = await listAllFiles(supabase, id)
    if (folder) files = files.filter((f) => f.path === folder || f.path.startsWith(`${folder}/`))
    if (!files.length) return new Response("Nenhum arquivo", { status: 404 })

    const zip = new JSZip()
    const blobs = await mapLimit(files, STORAGE_CONCURRENCY, async (f) => {
      const { data } = await supabase.storage.from(CLINIC_FILES_BUCKET).download(f.fullPath)
      return { path: f.path, buf: data ? await data.arrayBuffer() : null }
    })
    for (const b of blobs) if (b.buf) zip.file(b.path, b.buf)

    const baseName = folder ? folder.split("/").pop() || "arquivos" : `clinica-${id}`
    const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, "_")
    const buf = await zip.generateAsync({ type: "nodebuffer" })
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido"
    return new Response(`Falha ao montar o .zip: ${message}`, { status: 500 })
  }
}
