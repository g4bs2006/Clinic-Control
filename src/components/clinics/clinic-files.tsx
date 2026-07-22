"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Upload, Download, FileText, FolderUp, Trash2, X, Folder, ChevronRight, StickyNote, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  deleteClinicFile,
  deleteAllClinicFiles,
  getClinicFileDownloadUrl,
  createClinicFileUploadUrls,
  setClinicFileNote,
} from "@/lib/clinics/files-actions"
import {
  CLINIC_FILES_BUCKET,
  toStorageKey,
  type StoredFile,
} from "@/lib/storage/clinic-files"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const TEXT_EXTS = ["md", "txt", "csv", "json", "js", "ts", "py", "yml", "yaml", "html", "xml", "log", "env"]
const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? ""

// Árvore de pastas a partir dos caminhos relativos (path = "Pasta/Sub/arquivo.md").
// O upload preserva as subpastas na chave do Storage; aqui reconstruímos a hierarquia.
type FileTree = { folders: Map<string, FileTree>; files: StoredFile[] }

function buildFileTree(files: StoredFile[]): FileTree {
  const root: FileTree = { folders: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean)
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      let child = node.folders.get(seg)
      if (!child) {
        child = { folders: new Map(), files: [] }
        node.folders.set(seg, child)
      }
      node = child
    }
    node.files.push(f)
  }
  return root
}

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
  files: initialFiles,
  notes: initialNotes,
}: {
  clinicId: string
  files: StoredFile[]
  notes: Record<string, string>
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  // Prefixo destino do próximo upload ("" = raiz; ou o caminho de uma pasta).
  const uploadTargetRef = useRef<string>("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [viewLoading, setViewLoading] = useState<string | null>(null)
  // Pastas expandidas (por caminho completo). Vazio = tudo fechado por padrão.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Cópia local para exclusão otimista (some da lista na hora). Re-sincroniza
  // quando o servidor envia nova lista (padrão render-time, sem efeito).
  const [files, setFiles] = useState(initialFiles)
  const [prevFiles, setPrevFiles] = useState(initialFiles)
  if (prevFiles !== initialFiles) {
    setPrevFiles(initialFiles)
    setFiles(initialFiles)
  }
  // Anotações por caminho (pasta/arquivo), otimista + resync.
  const [notes, setNotes] = useState(initialNotes)
  const [prevNotes, setPrevNotes] = useState(initialNotes)
  if (prevNotes !== initialNotes) {
    setPrevNotes(initialNotes)
    setNotes(initialNotes)
  }
  const [noteEditing, setNoteEditing] = useState<{ path: string; value: string } | null>(null)

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

  function toggleFolder(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function openNoteEditor(path: string) {
    setNoteEditing({ path, value: notes[path] ?? "" })
  }

  // Salva (texto) ou remove (vazio) a nota, otimista com rollback.
  function persistNote(path: string, value: string) {
    const clean = value.trim()
    const snapshot = notes
    setNotes((prev) => {
      const next = { ...prev }
      if (clean) next[path] = clean
      else delete next[path]
      return next
    })
    setNoteEditing(null)
    ;(async () => {
      const res = await setClinicFileNote(clinicId, path, clean)
      if (!res.ok) {
        setNotes(snapshot)
        toast.error(res.error)
      }
    })()
  }

  // Abre o seletor de pasta apontando o upload para dentro de `prefix`
  // ("" = raiz). O handlePick lê uploadTargetRef e prefixa as chaves.
  function uploadInto(prefix: string) {
    uploadTargetRef.current = prefix
    inputRef.current?.click()
  }

  // Renderiza a árvore: pastas recolhíveis (fechadas por padrão) + arquivos, com
  // indentação por profundidade. Arquivo mostra só o nome (a pasta dá o contexto).
  // A abertura/fechamento anima a altura (grid-rows 0fr→1fr) e o chevron gira.
  function renderTree(tree: FileTree, depth: number, prefix: string): React.ReactNode {
    const folderNames = [...tree.folders.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"))
    const nodeFiles = [...tree.files].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    return (
      <>
        {folderNames.map((name) => {
          const folderPath = prefix ? `${prefix}/${name}` : name
          const isOpen = expanded.has(folderPath)
          const note = notes[folderPath]
          return (
            <div key={`folder:${folderPath}`}>
              <div
                className="group flex items-center gap-1.5 rounded-md pr-2 transition-colors hover:bg-accent/40"
                style={{ paddingLeft: depth * 14 + 4 }}
              >
                <button
                  type="button"
                  onClick={() => toggleFolder(folderPath)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium text-foreground/80"
                >
                  <ChevronRight
                    className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                  />
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => uploadInto(folderPath)}
                  disabled={busy}
                  title="Subir uma pasta aqui dentro"
                  aria-label={`Subir dentro de ${name}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
                >
                  <Plus className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openNoteEditor(folderPath)}
                  title={note ? "Editar anotação" : "Adicionar anotação"}
                  aria-label="Anotação da pasta"
                  className={`flex size-6 shrink-0 items-center justify-center rounded transition hover:bg-accent hover:text-foreground ${note ? "text-amber-500 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                >
                  <StickyNote className="size-3.5" />
                </button>
              </div>
              {note && (
                <p
                  className="truncate text-xs italic text-muted-foreground/80"
                  style={{ paddingLeft: depth * 14 + 26 }}
                  title={note}
                >
                  {note}
                </p>
              )}
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  {renderTree(tree.folders.get(name)!, depth + 1, folderPath)}
                </div>
              </div>
            </div>
          )
        })}
        {nodeFiles.map((f) => {
          const note = notes[f.path]
          return (
            <div key={f.fullPath}>
              <div
                style={{ paddingLeft: depth * 14 + 22 }}
                className="group flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-accent/50"
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => openFile(f)}
                  disabled={viewLoading === f.fullPath}
                  className="min-w-0 flex-1 truncate text-left text-foreground/90 hover:text-primary hover:underline disabled:opacity-50"
                  title={`Abrir ${f.path}`}
                >
                  {f.name}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => openNoteEditor(f.path)}
                  title={note ? "Editar anotação" : "Adicionar anotação"}
                  aria-label="Anotação do arquivo"
                  className={`flex size-6 shrink-0 items-center justify-center rounded transition hover:bg-accent hover:text-foreground ${note ? "text-amber-500 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                >
                  <StickyNote className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(f.path)}
                  aria-label={`Excluir ${f.path}`}
                  title="Excluir"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {note && (
                <p
                  className="truncate text-xs italic text-muted-foreground/80"
                  style={{ paddingLeft: depth * 14 + 40 }}
                  title={note}
                >
                  {note}
                </p>
              )}
            </div>
          )
        })}
      </>
    )
  }

  async function handleDelete(path: string) {
    const ok = await confirm({
      title: "Excluir arquivo?",
      description: `"${path}" será removido em definitivo. Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    // Otimista: some da lista na hora; reverte só se o servidor recusar.
    const snapshot = files
    setFiles((prev) => prev.filter((f) => f.path !== path))
    const res = await deleteClinicFile(clinicId, path)
    if (res.ok) {
      toast.success("Arquivo excluído")
    } else {
      setFiles(snapshot)
      toast.error(res.error)
    }
  }

  async function handleDeleteAll() {
    const ok = await confirm({
      title: "Excluir todos os arquivos?",
      description: `Os ${files.length} arquivo(s) desta clínica serão removidos em definitivo. Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir tudo",
      destructive: true,
    })
    if (!ok) return
    const snapshot = files
    setBusy(true)
    setFiles([])
    const res = await deleteAllClinicFiles(clinicId)
    setBusy(false)
    if (res.ok) {
      toast.success(`${res.deleted} arquivo(s) excluído(s)`)
    } else {
      setFiles(snapshot)
      toast.error(res.error)
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    // Prefixo definido pelo botão que abriu o seletor ("" = raiz, ou uma pasta).
    const target = uploadTargetRef.current
    uploadTargetRef.current = ""
    if (!list || list.length === 0) return
    const arr = Array.from(list)
    setBusy(true)
    setProgress({ done: 0, total: arr.length })
    const supabase = createClient()

    // Upload via URLs assinadas (o navegador não tem mais sessão no Storage).
    // `target` aninha o conteúdo dentro de uma pasta existente.
    const keyed = arr.map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      return { file, key: toStorageKey(target ? `${target}/${rel}` : rel) }
    })
    const signed = await createClinicFileUploadUrls(clinicId, keyed.map((k) => k.key))
    if (!signed.ok) {
      toast.error(signed.error)
      setBusy(false)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    const tokenByPath = new Map(signed.uploads.map((u) => [u.path, u]))

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
      if (error) failed++ // não aborta o lote: segue para os demais
      setProgress({ done: i + 1, total: arr.length })
    }

    if (failed === 0) toast.success(target ? "Enviado para a pasta" : "Pasta enviada")
    else toast.warning(`Enviado com ${failed} falha(s)`)

    // Abre a pasta de destino pra mostrar o que acabou de entrar.
    if (target) setExpanded((prev) => new Set(prev).add(target))
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
        <Button type="button" size="sm" disabled={busy} onClick={() => uploadInto("")}>
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
        <div className="flex flex-col gap-0.5">
          {renderTree(buildFileTree(files), 0, "")}
        </div>
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

      {/* Editor de anotação (pasta ou arquivo) */}
      <Dialog open={noteEditing != null} onOpenChange={(v) => !v && setNoteEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="size-4" /> Anotação
            </DialogTitle>
            <DialogDescription className="truncate">{noteEditing?.path}</DialogDescription>
          </DialogHeader>
          <textarea
            value={noteEditing?.value ?? ""}
            onChange={(e) => setNoteEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            rows={5}
            autoFocus
            placeholder="Escreva uma anotação para esta pasta ou arquivo…"
            className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <DialogFooter className="sm:justify-between">
            {noteEditing && notes[noteEditing.path] ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => noteEditing && persistNote(noteEditing.path, "")}
              >
                <Trash2 className="size-3.5" />
                Remover
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
              <Button type="button" onClick={() => noteEditing && persistNote(noteEditing.path, noteEditing.value)}>
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
