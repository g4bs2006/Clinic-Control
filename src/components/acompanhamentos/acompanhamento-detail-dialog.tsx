"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Paperclip, Trash2, Send, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { imageFilesFromClipboard } from "@/lib/paste-images"
import { TASK_ATTACHMENTS_BUCKET } from "@/lib/tasks/categories"
import {
  listAcompanhamentoComments,
  addAcompanhamentoComment,
  listAcompanhamentoAttachments,
  createAcompanhamentoAttachmentUploadUrl,
  confirmAcompanhamentoAttachment,
  getAcompanhamentoAttachmentUrl,
  deleteAcompanhamentoAttachment,
  type AcompanhamentoRow,
  type AcompanhamentoComment,
  type AcompanhamentoAttachment,
} from "@/lib/acompanhamentos/actions"

function fmtBytes(n: number | null): string {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

export function AcompanhamentoDetailDialog({
  item,
  onClose,
}: {
  item: AcompanhamentoRow | null
  onClose: () => void
}) {
  const id = item?.id ?? null
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<AcompanhamentoComment[]>([])
  const [attachments, setAttachments] = useState<AcompanhamentoAttachment[]>([])
  const [comment, setComment] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  // Linhas "pendentes" das criações — aparecem na hora (esmaecidas) e somem
  // quando o refetch traz a versão real.
  const [pendingUploads, setPendingUploads] = useState<{ id: string; name: string }[]>([])
  const [pendingComments, setPendingComments] = useState<{ id: string; body: string }[]>([])

  async function reload(aId: string) {
    const [cs, atts] = await Promise.all([
      listAcompanhamentoComments(aId),
      listAcompanhamentoAttachments(aId),
    ])
    setComments(cs)
    setAttachments(atts)
  }

  useEffect(() => {
    setPendingUploads([])
    setPendingComments([])
    if (!id) {
      setComments([])
      setAttachments([])
      setComment("")
      return
    }
    setLoading(true)
    reload(id).finally(() => setLoading(false))
  }, [id])

  // Colar print (Ctrl+V) com o diálogo aberto vira anexo. Sem imagem no
  // clipboard (colar texto num campo), o Ctrl+V segue normal.
  useEffect(() => {
    if (!id) return
    function onPaste(e: ClipboardEvent) {
      const imgs = imageFilesFromClipboard(e.clipboardData)
      if (!imgs.length) return
      e.preventDefault()
      uploadFiles(imgs)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function submitComment() {
    if (!id || !comment.trim()) return
    const aId = id
    const body = comment.trim()
    const tempId = `pend-cmt-${Date.now()}`
    setPendingComments((prev) => [...prev, { id: tempId, body }])
    setComment("")
    startTransition(async () => {
      const res = await addAcompanhamentoComment(aId, body)
      if (res.ok) {
        await reload(aId)
        setPendingComments((prev) => prev.filter((p) => p.id !== tempId))
      } else {
        setPendingComments((prev) => prev.filter((p) => p.id !== tempId))
        setComment(body)
        toast.error(res.error)
      }
    })
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    uploadFiles(files)
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || !id) return
    const aId = id
    const pend = files.map((f, i) => ({ id: `pend-up-${Date.now()}-${i}`, name: f.name }))
    setPendingUploads((prev) => [...prev, ...pend])
    setUploading(true)
    setUploadProgress({ done: 0, total: files.length })
    let failed = 0
    try {
      for (const file of files) {
        try {
          const signed = await createAcompanhamentoAttachmentUploadUrl(aId, file.name)
          if (!signed.ok) throw new Error(signed.error)
          const supabase = createClient()
          const { error } = await supabase.storage
            .from(TASK_ATTACHMENTS_BUCKET)
            .uploadToSignedUrl(signed.path, signed.token, file)
          if (error) throw new Error(error.message)
          const confirmed = await confirmAcompanhamentoAttachment({
            acompanhamentoId: aId,
            filePath: signed.path,
            fileName: file.name,
            contentType: file.type || null,
            sizeBytes: file.size,
          })
          if (!confirmed.ok) throw new Error(confirmed.error)
        } catch (e) {
          failed++
          toast.error(`${file.name}: ${e instanceof Error ? e.message : "Falha no upload"}`)
        }
        setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
      }
      const sent = files.length - failed
      if (sent > 0) {
        toast.success(sent === 1 ? "Anexo enviado." : `${sent} anexos enviados.`)
        await reload(aId)
      }
    } finally {
      setUploading(false)
      setUploadProgress(null)
      const pendIds = new Set(pend.map((p) => p.id))
      setPendingUploads((prev) => prev.filter((p) => !pendIds.has(p.id)))
    }
  }

  async function downloadAttachment(attId: string) {
    const res = await getAcompanhamentoAttachmentUrl(attId)
    if (res.ok) window.open(res.url, "_blank")
    else toast.error(res.error)
  }

  function removeAttachment(attId: string) {
    if (!id) return
    // Otimista: some da lista na hora; reverte só se o servidor recusar.
    const snapshot = attachments
    setAttachments((prev) => prev.filter((a) => a.id !== attId))
    startTransition(async () => {
      const res = await deleteAcompanhamentoAttachment(attId)
      if (!res.ok) {
        setAttachments(snapshot)
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={id != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {loading || !item ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-left text-lg">{item.title}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-5">
              {/* Metadados */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-accent px-2 py-0.5 capitalize">{item.status}</span>
                {item.clinic_name && <span>· {item.clinic_name}</span>}
                {item.assigned_to_name && <span>· {item.assigned_to_name}</span>}
                {item.source === "ia" && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">
                    Origem: IA
                  </span>
                )}
              </div>

              {item.description && (
                <p className="rounded-md border border-border/60 bg-accent/20 p-3 text-sm text-foreground">
                  {item.description}
                </p>
              )}

              {/* Anexos */}
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Anexos {attachments.length > 0 && `(${attachments.length})`}
                  </p>
                  <label
                    title="Anexar arquivos — ou cole um print com Ctrl+V"
                    className={buttonVariants({ size: "sm", variant: "outline", className: "cursor-pointer" })}
                  >
                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
                    {uploadProgress ? `Enviando ${uploadProgress.done}/${uploadProgress.total}` : "Anexar arquivos"}
                    <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
                  </label>
                </div>
                {attachments.length === 0 && pendingUploads.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum anexo ainda — cole um print com <kbd className="rounded border border-border px-1 text-[0.7em]">Ctrl+V</kbd> ou use Anexar arquivos.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {pendingUploads.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 py-2 text-sm opacity-60">
                        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 text-[0.68rem] text-muted-foreground">enviando…</span>
                      </li>
                    ))}
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                        <button
                          type="button"
                          onClick={() => downloadAttachment(a.id)}
                          className="flex-1 truncate text-left text-brand-gradient hover:opacity-85"
                          title="Baixar anexo"
                        >
                          {a.file_name}
                        </button>
                        <span className="shrink-0 text-[0.68rem] text-muted-foreground">{fmtBytes(a.size_bytes)}</span>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="size-9 shrink-0 text-muted-foreground hover:text-red-400 sm:size-7"
                          aria-label="Excluir anexo"
                          onClick={() => removeAttachment(a.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Atividade / comentários */}
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comentários</p>
                <ul className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                  {comments.length === 0 && pendingComments.length === 0 && (
                    <li className="text-xs text-muted-foreground">Nenhum comentário ainda.</li>
                  )}
                  {comments.map((c) => (
                    <li key={c.id} className={c.kind === "system" ? "text-xs italic text-muted-foreground" : "text-sm"}>
                      {c.kind === "comment" && <span className="font-semibold">{c.author_name ?? "Alguém"}: </span>}
                      {c.body}
                      <span className="ml-1.5 text-[0.62rem] text-muted-foreground/70">{fmtDateTime(c.created_at)}</span>
                    </li>
                  ))}
                  {pendingComments.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 text-sm opacity-60">
                      <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                      <span className="break-words">{p.body}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitComment()}
                    placeholder="Adicionar comentário…"
                    className="h-8 flex-1"
                  />
                  <Button type="button" size="icon-sm" disabled={pending || !comment.trim()} onClick={submitComment}>
                    <Send className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <DialogClose className={buttonVariants({ variant: "outline" })}>Fechar</DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
