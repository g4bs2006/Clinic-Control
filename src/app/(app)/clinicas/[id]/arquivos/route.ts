import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import {
  CLINIC_FILES_BUCKET,
  listAllFiles,
} from "@/lib/storage/clinic-files"

// GET /clinicas/<id>/arquivos → baixa todos os arquivos da clínica num .zip
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Não autorizado", { status: 401 })

  const files = await listAllFiles(supabase, id)
  if (!files.length) return new Response("Nenhum arquivo", { status: 404 })

  const zip = new JSZip()
  for (const f of files) {
    const { data } = await supabase.storage
      .from(CLINIC_FILES_BUCKET)
      .download(f.fullPath)
    if (data) zip.file(f.path, await data.arrayBuffer())
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" })
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="clinica-${id}.zip"`,
    },
  })
}
