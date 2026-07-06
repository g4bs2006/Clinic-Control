"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Upload, Download, FileText, FolderUp, Trash2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { importParsedAgents } from "@/lib/agents/actions"
import {
  deleteClinicFile,
  deleteAllClinicFiles,
  getClinicFileDownloadUrl,
  createClinicFileUploadUrls,
} from "@/lib/clinics/files-actions"
import {
  CLINIC_FILES_BUCKET,
  toStorageKey,
  type StoredFile,
} from "@/lib/storage/clinic-files"
import { Button } from "@/components/ui/button"
import type { InputFile } from "@/lib/agents/parser"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const isAgentMd = (rel: string) => /\.md$/i.test(rel)
const TEXT_EXTS = ["md", "txt", "csv", "json", "js", "ts", "py", "yml", "yaml", "html", "xml", "log", "env"]
const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? ""

// CSV simples com suporte a aspas; detecta ; ou , pelo cabeçalho.
function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? ""
  const delim = firstLine.split(";").length > firstLine.split(",").length ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === delim) { row.push(field); field = "" }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
    else if (c !== "\r") field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ""))
}

type ViewState =
  | { path: string; kind: "md" | "csv" | "text"; text: string }
  | { path: string; kind: "binary"; url: string }

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
  const [deleting, setDeleting] = useState<string | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [viewLoading, setViewLoading] = useState<string | null>(null)

  async function openFile(f: StoredFile) {
    setViewLoading(f.fullPath)
    try {
      const signed = await getClinicFileDownloadUrl(clinicId, f.path)
      if (!signed.ok) throw new Error(signed.error)
      const res = await fetch(signed.url)
      if (!res.ok) throw new Error("Falha ao abrir")
      const data = await res.blob()
      const e = ext(f.path)
      if (TEXT_EXTS.includes(e)) {
        const text = await data.text()
        setView({ path: f.path, kind: e === "md" ? "md" : e === "csv" ? "csv" : "text", text })
      } else {
        setView({ path: f.path, kind: "binary", url: URL.createObjectURL(data) })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao abrir arquivo")
    } finally {
      setViewLoading(null)
    }
  }

  function closeView() {
    if (view?.kind === "binary") URL.revokeObjectURL(view.url)
    setView(null)
  }

  async function handleDelete(path: string) {
    if (!confirm(`Excluir "${path}"? Essa ação não pode ser desfeita.`)) return
    setDeleting(path)
    const res = await deleteClinicFile(clinicId, path)
    setDeleting(null)
    if (res.ok) {
      toast.success("Arquivo excluído")
      router.refresh()
    } else toast.error(res.error)
  }

  async function handleDeleteAll() {
    if (!confirm(`Excluir TODOS os ${files.length} arquivo(s) desta clínica? Essa ação não pode ser desfeita.`))
      return
    setBusy(true)
    const res = await deleteAllClinicFiles(clinicId)
    setBusy(false)
    if (res.ok) {
      toast.success(`${res.deleted} arquivo(s) excluído(s)`)
      router.refresh()
    } else toast.error(res.error)
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    const arr = Array.from(list)
    setBusy(true)
    setProgress({ done: 0, total: arr.length })
    const supabase = createClient()

    // Upload via URLs assinadas (o navegador não tem mais sessão no Storage).
    const keyed = arr.map((file) => ({
      file,
      key: toStorageKey(
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      ),
    }))
    const signed = await createClinicFileUploadUrls(clinicId, keyed.map((k) => k.key))
    if (!signed.ok) {
      toast.error(signed.error)
      setBusy(false)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    const tokenByPath = new Map(signed.uploads.map((u) => [u.path, u]))

    const promptFiles: InputFile[] = []
    let failed = 0
    for (let i = 0; i < keyed.length; i++) {
      const { file, key } = keyed[i]
      const upload = tokenByPath.get(key)
      if (!upload) {
        failed++
        setProgress({ done: i + 1, total: arr.length })
        continue
      }
      const { error } = await supabase.storage
        .from(CLINIC_FILES_BUCKET)
        .uploadToSignedUrl(upload.fullPath, upload.token, file)
      if (error) {
        failed++ // não aborta o lote: segue para os demais
      } else if (isAgentMd(key)) {
        promptFiles.push({ path: key, content: await file.text() })
      }
      setProgress({ done: i + 1, total: arr.length })
    }

    // Importação de agentes é best-effort — não bloqueia o upload.
    let importMsg = ""
    if (promptFiles.length) {
      const res = await importParsedAgents(clinicId, promptFiles)
      if (res.ok) importMsg = ` · ${res.agents} agente(s), ${res.stages} estágio(s)`
    }
    if (failed === 0) toast.success(`Pasta enviada${importMsg}`)
    else toast.warning(`Enviado com ${failed} falha(s)${importMsg}`)

    router.refresh()
    setBusy(false)
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ""
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
          {...{ webkitdirectory: "", directory: "" }}
        />
        <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <FolderUp className="size-4" />
          {busy ? (progress ? `Enviando ${progress.done}/${progress.total}…` : "Enviando…") : "Subir pasta"}
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
        {files.length > 0 && (
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium text-destructive hover:bg-destructive/15 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Excluir tudo
          </button>
        )}
      </div>

      {/* Lista */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Upload className="size-6 opacity-40" />
          <span className="text-sm">Nenhum arquivo ainda</span>
          <span className="text-xs opacity-70">
            Suba a pasta da clínica — clique num arquivo para visualizar.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {files.map((f) => (
            <li
              key={f.fullPath}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => openFile(f)}
                disabled={viewLoading === f.fullPath}
                className="flex-1 truncate text-left text-foreground/90 hover:text-primary hover:underline disabled:opacity-50"
                title={`Abrir ${f.path}`}
              >
                {f.path}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {fmtBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(f.path)}
                disabled={deleting === f.path}
                aria-label={`Excluir ${f.path}`}
                title="Excluir"
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Visualizador */}
      {view && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4"
          onClick={closeView}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-medium text-foreground" title={view.path}>
                {view.path}
              </span>
              <button
                type="button"
                onClick={closeView}
                aria-label="Fechar"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {view.kind === "md" && (
                <div className="md-prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{view.text}</ReactMarkdown>
                </div>
              )}
              {view.kind === "csv" && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {parseCsv(view.text).map((r, ri) => (
                        <tr key={ri}>
                          {r.map((cell, ci) => {
                            const Tag = ri === 0 ? "th" : "td"
                            return (
                              <Tag
                                key={ci}
                                className={`border border-border px-2 py-1 text-left align-top ${
                                  ri === 0
                                    ? "bg-muted font-semibold text-foreground"
                                    : "text-foreground/90"
                                }`}
                              >
                                {cell}
                              </Tag>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {view.kind === "text" && (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
                  {view.text}
                </pre>
              )}
              {view.kind === "binary" && (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <span className="text-sm">Pré-visualização não disponível para este tipo.</span>
                  <a
                    href={view.url}
                    download={view.path.split("/").pop()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <Download className="size-4" /> Baixar arquivo
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
