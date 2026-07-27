"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Upload,
  Download,
  FileText,
  FolderUp,
  Trash2,
  X,
  Folder,
  ChevronRight,
  StickyNote,
  Plus,
  Users,
  Lock,
  Loader2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  listVaultFiles,
  getVaultFileDownloadUrl,
  createVaultFileUploadUrls,
  deleteVaultFile,
  deleteVaultFolder,
  deleteAllVaultFiles,
  setVaultVisibility,
  setVaultFileNote,
} from "@/lib/vault/files-actions"
import {
  VAULT_FILES_BUCKET,
  toStorageKey,
  type VaultStoredFile,
  type VaultFileMeta,
} from "@/lib/storage/vault-files"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const TEXT_EXTS = ["md", "txt", "csv", "json", "js", "ts", "py", "yml", "yaml", "html", "xml", "log", "env"]
const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? ""

type FileTree = { folders: Map<string, FileTree>; files: VaultStoredFile[] }

function buildFileTree(files: VaultStoredFile[]): FileTree {
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

// Ancestrais de um caminho: "a/b/c" → ["a", "a/b"].
function ancestors(path: string): string[] {
  const parts = path.split("/")
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"))
  return out
}

export function VaultFiles({
  files: initialFiles,
  meta: initialMeta,
  isGestor,
}: {
  files: VaultStoredFile[]
  meta: Record<string, VaultFileMeta>
  /** Só afeta a UI (ações de gestão) — a autorização real vive nas actions. */
  isGestor: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  // Dois inputs separados: pasta exige webkitdirectory ESTÁTICO (alternar o
  // atributo no mesmo input é frágil e o navegador ignora na hora do clique).
  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string>("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [viewLoading, setViewLoading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [, startVisibility] = useTransition()

  const [files, setFiles] = useState(initialFiles)
  const [prevFiles, setPrevFiles] = useState(initialFiles)
  if (prevFiles !== initialFiles) {
    setPrevFiles(initialFiles)
    setFiles(initialFiles)
  }
  const [meta, setMeta] = useState(initialMeta)
  const [prevMeta, setPrevMeta] = useState(initialMeta)
  if (prevMeta !== initialMeta) {
    setPrevMeta(initialMeta)
    setMeta(initialMeta)
  }
  const [noteEditing, setNoteEditing] = useState<{ path: string; value: string } | null>(null)

  const isShared = (path: string) => !!meta[path]?.visibleToDevs
  const inheritsShare = (path: string) => ancestors(path).some((a) => meta[a]?.visibleToDevs)
  const noteOf = (path: string) => meta[path]?.note ?? undefined

  async function openFile(f: VaultStoredFile) {
    setViewLoading(f.path)
    try {
      const signed = await getVaultFileDownloadUrl(f.path)
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
    setNoteEditing({ path, value: noteOf(path) ?? "" })
  }

  // Corpo do editor de anotação — usado dentro do popover ancorado no ícone de
  // nota (pasta ou arquivo). Só é montado no item aberto (noteEditing.path).
  function noteEditorBody(path: string) {
    const hasNote = !!noteOf(path)
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <StickyNote className="size-4" /> Anotação
        </p>
        <p className="truncate text-xs text-muted-foreground" title={path}>{path}</p>
        <textarea
          value={noteEditing?.value ?? ""}
          onChange={(e) => setNoteEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          rows={4}
          autoFocus
          placeholder="Escreva uma anotação para esta pasta ou arquivo…"
          className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center justify-between gap-2">
          {hasNote ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => persistNote(path, "")}
            >
              <Trash2 className="size-3.5" />
              Remover
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setNoteEditing(null)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={() => noteEditing && persistNote(path, noteEditing.value)}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  function persistNote(path: string, value: string) {
    const clean = value.trim()
    const snapshot = meta
    setMeta((prev) => ({ ...prev, [path]: { visibleToDevs: prev[path]?.visibleToDevs ?? false, note: clean || null } }))
    setNoteEditing(null)
    ;(async () => {
      const res = await setVaultFileNote(path, clean)
      if (!res.ok) {
        setMeta(snapshot)
        toast.error(res.error)
      }
    })()
  }

  // Alterna o compartilhamento explícito de um arquivo/pasta com a equipe.
  function toggleShare(path: string) {
    const next = !isShared(path)
    const snapshot = meta
    setMeta((prev) => ({ ...prev, [path]: { visibleToDevs: next, note: prev[path]?.note ?? null } }))
    startVisibility(async () => {
      const res = await setVaultVisibility(path, next)
      if (!res.ok) {
        setMeta(snapshot)
        toast.error(res.error)
      } else {
        toast.success(next ? "Compartilhado com a equipe" : "Deixou de compartilhar")
      }
    })
  }

  function pickFiles(prefix: string) {
    uploadTargetRef.current = prefix
    filesInputRef.current?.click()
  }

  function pickFolder(prefix: string) {
    uploadTargetRef.current = prefix
    folderInputRef.current?.click()
  }

  // Botão de compartilhar (só gestor). Cheio = compartilhado explicitamente;
  // esmaecido = herdado de uma pasta acima (clicar torna explícito neste item).
  function ShareButton({ path, name }: { path: string; name: string }) {
    if (!isGestor) return null
    const explicit = isShared(path)
    const inherited = !explicit && inheritsShare(path)
    return (
      <button
        type="button"
        onClick={() => toggleShare(path)}
        title={
          explicit
            ? "Compartilhado com a equipe — clique para tornar restrito"
            : inherited
              ? "Compartilhado por uma pasta acima — clique para marcar aqui também"
              : "Compartilhar com a equipe"
        }
        aria-label={`Compartilhamento de ${name}`}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded transition hover:bg-accent",
          explicit
            ? "text-sky-500 opacity-100"
            : inherited
              ? "text-sky-500/40 opacity-100 hover:text-sky-500"
              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
        )}
      >
        {explicit || inherited ? <Users className="size-3.5" /> : <Lock className="size-3.5" />}
      </button>
    )
  }

  async function deleteFolder(folderPath: string) {
    const ok = await confirm({
      title: "Excluir pasta?",
      description: `A pasta "${folderPath}" e todo o seu conteúdo serão removidos em definitivo. Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir pasta",
      destructive: true,
    })
    if (!ok) return
    const under = (p: string) => p === folderPath || p.startsWith(`${folderPath}/`)
    const filesSnapshot = files
    const metaSnapshot = meta
    setFiles((prev) => prev.filter((f) => !under(f.path)))
    setMeta((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) if (under(k)) delete next[k]
      return next
    })
    const res = await deleteVaultFolder(folderPath)
    if (res.ok) {
      toast.success(`Pasta excluída (${res.deleted} arquivo${res.deleted === 1 ? "" : "s"})`)
    } else {
      setFiles(filesSnapshot)
      setMeta(metaSnapshot)
      toast.error(res.error)
    }
  }

  function renderTree(tree: FileTree, depth: number, prefix: string): React.ReactNode {
    const folderNames = [...tree.folders.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"))
    const nodeFiles = [...tree.files].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    return (
      <>
        {folderNames.map((name) => {
          const folderPath = prefix ? `${prefix}/${name}` : name
          const isOpen = expanded.has(folderPath)
          const note = noteOf(folderPath)
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
                <ShareButton path={folderPath} name={name} />
                {isGestor && (
                  <button
                    type="button"
                    onClick={() => pickFiles(folderPath)}
                    disabled={busy}
                    title="Subir arquivos aqui dentro"
                    aria-label={`Subir dentro de ${name}`}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
                <a
                  href={`/cofre/arquivos?path=${encodeURIComponent(folderPath)}`}
                  title="Baixar esta pasta (.zip)"
                  aria-label={`Baixar pasta ${name}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  <Download className="size-3.5" />
                </a>
                {isGestor && (
                  <>
                    <Popover
                      open={noteEditing?.path === folderPath}
                      onOpenChange={(o) => (o ? openNoteEditor(folderPath) : setNoteEditing(null))}
                    >
                      <PopoverTrigger
                        render={
                          <button
                            type="button"
                            title={note ? "Editar anotação" : "Adicionar anotação"}
                            aria-label="Anotação da pasta"
                            className={`flex size-6 shrink-0 items-center justify-center rounded transition hover:bg-accent hover:text-foreground ${note ? "text-amber-500 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                          >
                            <StickyNote className="size-3.5" />
                          </button>
                        }
                      />
                      <PopoverContent align="end" className="w-72">
                        {noteEditing?.path === folderPath && noteEditorBody(folderPath)}
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      onClick={() => deleteFolder(folderPath)}
                      disabled={busy}
                      title="Excluir esta pasta"
                      aria-label={`Excluir pasta ${name}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
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
          const note = noteOf(f.path)
          return (
            <div key={f.path}>
              <div
                style={{ paddingLeft: depth * 14 + 22 }}
                className="group flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-accent/50"
              >
                {viewLoading === f.path ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  onClick={() => openFile(f)}
                  disabled={viewLoading === f.path}
                  className="min-w-0 flex-1 truncate text-left text-foreground/90 hover:text-primary hover:underline disabled:opacity-50"
                  title={`Abrir ${f.path}`}
                >
                  {f.name}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtBytes(f.size)}</span>
                <ShareButton path={f.path} name={f.name} />
                {isGestor && (
                  <>
                    <Popover
                      open={noteEditing?.path === f.path}
                      onOpenChange={(o) => (o ? openNoteEditor(f.path) : setNoteEditing(null))}
                    >
                      <PopoverTrigger
                        render={
                          <button
                            type="button"
                            title={note ? "Editar anotação" : "Adicionar anotação"}
                            aria-label="Anotação do arquivo"
                            className={`flex size-6 shrink-0 items-center justify-center rounded transition hover:bg-accent hover:text-foreground ${note ? "text-amber-500 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                          >
                            <StickyNote className="size-3.5" />
                          </button>
                        }
                      />
                      <PopoverContent align="end" className="w-72">
                        {noteEditing?.path === f.path && noteEditorBody(f.path)}
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      onClick={() => handleDelete(f.path)}
                      aria-label={`Excluir ${f.path}`}
                      title="Excluir"
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
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
    const snapshot = files
    setFiles((prev) => prev.filter((f) => f.path !== path))
    const res = await deleteVaultFile(path)
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
      description: `Os ${files.length} arquivo(s) do cofre serão removidos em definitivo. Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir tudo",
      destructive: true,
    })
    if (!ok) return
    const snapshot = files
    setBusy(true)
    setFiles([])
    const res = await deleteAllVaultFiles()
    setBusy(false)
    if (res.ok) {
      toast.success(`${res.deleted} arquivo(s) excluído(s)`)
    } else {
      setFiles(snapshot)
      toast.error(res.error)
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const inputEl = e.target
    const list = e.target.files
    const target = uploadTargetRef.current
    uploadTargetRef.current = ""
    if (!list || list.length === 0) return
    const arr = Array.from(list)
    setBusy(true)
    setProgress({ done: 0, total: arr.length })
    const supabase = createClient()

    const keyed = arr.map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      return { file, key: toStorageKey(target ? `${target}/${rel}` : rel) }
    })
    const signed = await createVaultFileUploadUrls(keyed.map((k) => k.key))
    if (!signed.ok) {
      toast.error(signed.error)
      setBusy(false)
      setProgress(null)
      inputEl.value = ""
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
        .from(VAULT_FILES_BUCKET)
        .uploadToSignedUrl(upload.path, upload.token, file)
      if (error) failed++
      setProgress({ done: i + 1, total: arr.length })
    }

    if (failed === 0) toast.success(target ? "Enviado para a pasta" : "Arquivos enviados")
    else toast.warning(`Enviado com ${failed} falha(s)`)

    if (target) setExpanded((prev) => new Set(prev).add(target))
    // Recarrega a lista do servidor (padrão para criações que dependem do Storage).
    const refreshed = await listVaultFiles()
    if (refreshed.ok) {
      setFiles(refreshed.files)
      setMeta(refreshed.meta)
    } else {
      router.refresh()
    }
    setBusy(false)
    setProgress(null)
    inputEl.value = ""
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ações (só gestor sobe/exclui; dev só navega e baixa o que foi compartilhado) */}
      {isGestor && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={filesInputRef} type="file" multiple hidden onChange={handlePick} />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            hidden
            onChange={handlePick}
            {...{ webkitdirectory: "", directory: "" }}
          />
          <Button type="button" size="sm" disabled={busy} onClick={() => pickFiles("")}>
            <Upload className="size-4" />
            {busy ? (progress ? `Enviando ${progress.done}/${progress.total}…` : "Enviando…") : "Subir arquivos"}
          </Button>
          <button
            type="button"
            onClick={() => pickFolder("")}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <FolderUp className="size-3.5" />
            Subir pasta
          </button>

          {files.length > 0 && (
            <a
              href="/cofre/arquivos"
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
      )}

      {/* Lista */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-muted-foreground">
          <Upload className="size-6 opacity-40" />
          <span className="text-sm">
            {isGestor ? "Nenhum arquivo no cofre ainda" : "Nenhum arquivo foi compartilhado com a equipe ainda"}
          </span>
          {isGestor && (
            <span className="text-xs opacity-70">
              Suba arquivos ou pastas importantes — clique num arquivo para visualizar.
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">{renderTree(buildFileTree(files), 0, "")}</div>
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
                                  ri === 0 ? "bg-muted font-semibold text-foreground" : "text-foreground/90"
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
