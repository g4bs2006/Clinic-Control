"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, Download, FileText, FolderUp } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { importParsedAgents } from "@/lib/agents/actions"
import { CLINIC_FILES_BUCKET, type StoredFile } from "@/lib/storage/clinic-files"
import { Button } from "@/components/ui/button"
import type { InputFile } from "@/lib/agents/parser"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// arquivo dentro de uma pasta "Prompts <Nome>/..." e .md → alimenta o parser
const isPromptMd = (rel: string) => /(^|\/)Prompts\s+[^/]+\/.+\.md$/i.test(rel)

export function ClinicFiles({
  clinicId,
  files,
}: {
  clinicId: string
  files: StoredFile[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    const arr = Array.from(list)
    setBusy(true)
    setProgress({ done: 0, total: arr.length })
    const supabase = createClient()

    try {
      const promptFiles: InputFile[] = []
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const rel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name
        const { error } = await supabase.storage
          .from(CLINIC_FILES_BUCKET)
          .upload(`${clinicId}/${rel}`, file, { upsert: true })
        if (error) throw new Error(`${rel}: ${error.message}`)
        if (isPromptMd(rel)) {
          promptFiles.push({ path: rel, content: await file.text() })
        }
        setProgress({ done: i + 1, total: arr.length })
      }

      const res = await importParsedAgents(clinicId, promptFiles)
      if (res.ok) {
        toast.success(
          `Pasta enviada · ${res.agents} agente(s) e ${res.stages} estágio(s) importados`,
        )
      } else {
        toast.error(`Arquivos enviados, mas a importação falhou: ${res.error}`)
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload")
    } finally {
      setBusy(false)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={handlePick}
          // seleciona uma pasta inteira (atributos não-padrão do Chromium)
          {...{ webkitdirectory: "", directory: "" }}
        />
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <FolderUp className="size-4" />
          {busy
            ? progress
              ? `Enviando ${progress.done}/${progress.total}…`
              : "Enviando…"
            : "Subir pasta"}
        </Button>

        {files.length > 0 && (
          <a
            href={`/clinicas/${clinicId}/arquivos`}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-accent"
          >
            <Download className="size-3.5" />
            Baixar tudo (.zip)
          </a>
        )}
      </div>

      {/* Lista */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Upload className="size-6 opacity-40" />
          <span className="text-sm">Nenhum arquivo ainda</span>
          <span className="text-xs opacity-70">
            Suba a pasta da clínica — os agentes/estágios são importados automaticamente.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {files.map((f) => (
            <li
              key={f.fullPath}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-foreground/90" title={f.path}>
                {f.path}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {fmtBytes(f.size)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
