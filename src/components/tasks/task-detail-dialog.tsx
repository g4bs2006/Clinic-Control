"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Sparkles, Paperclip, Trash2, Send, Loader2, X, CheckCircle2, RotateCcw, Pencil, Check, Plus, ArrowLeft, Building2, ExternalLink, Pin, PinOff } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TaskFields, type ClinicOption, type ProfileOption } from "./task-fields"
import { DependencySection } from "./dependency-picker"
import { listBlockers, listBlocking, type DependencyTaskRow } from "@/lib/tasks/dependencies"
import { createClient } from "@/lib/supabase/client"
import { imageFilesFromClipboard } from "@/lib/paste-images"
import {
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  pinTask,
  listSubtasks,
  createSubtasks,
  suggestSubtasks,
  listTaskAttachments,
  createTaskAttachmentUploadUrl,
  confirmTaskAttachment,
  getTaskAttachmentUrl,
  deleteTaskAttachment,
  listTaskActivity,
  addTaskComment,
  updateTaskComment,
  deleteTaskComment,
  renameTaskAttachment,
  type TaskRow,
  type TaskAttachmentRow,
  type TaskActivityRow,
} from "@/lib/tasks/actions"
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_ATTACHMENTS_BUCKET,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

// Pílulas de resumo (glance) do rail no modo página — os controles editáveis
// seguem em TaskFields logo abaixo; estas só dão o estado de relance.
const STATUS_PILL: Record<TaskStatus, string> = {
  pendente: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  em_andamento: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  concluida: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  cancelada: "border-border bg-muted/40 text-muted-foreground",
}
const PRIORITY_PILL: Record<TaskPriority, string> = {
  baixa: "border-border bg-muted/40 text-muted-foreground",
  media: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  alta: "border-red-400/30 bg-red-400/10 text-red-300",
  urgente: "border-red-500/30 bg-red-500/15 text-red-400",
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i
function isImageAttachment(a: TaskAttachmentRow): boolean {
  return (a.content_type?.startsWith("image/") ?? false) || IMAGE_EXT.test(a.file_name)
}

function fmtBytes(n: number | null): string {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtShortDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

// Destaca "@Nome" no corpo do comentário quando bate com um nome conhecido da
// equipe (nomes mais longos primeiro, para "@Maria Silva" ganhar de "@Maria").
function renderMentions(body: string, names: string[]): React.ReactNode {
  if (names.length === 0) return body
  const escaped = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const re = new RegExp(`@(?:${escaped.join("|")})`, "g")
  const out: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index))
    out.push(
      <span key={key++} className="font-semibold text-brand-gradient">
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < body.length) out.push(body.slice(last))
  return out
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

interface TaskDetailDialogProps {
  taskId: string | null
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  onClose: () => void
  /** Reflete a troca de status no board na hora (otimista, sem refetch). */
  onStatusChange?: (id: string, status: TaskStatus) => void
  /** Remove a tarefa do board na hora ao excluir (otimista, sem refetch). */
  onDeleted?: (id: string) => void
  /** Reflete o fixar/soltar no board na hora (entra/sai do bloco "Em foco"). */
  onPinned?: (id: string, pinnedAt: string | null) => void
  onChanged: () => void
  currentUserId?: string | null
  /** Renderiza como PÁGINA (2 colunas, sem o wrapper de diálogo) em vez de modal. */
  asPage?: boolean
  /** Só no modo página: destino do botão "Voltar" (padrão /tarefas). */
  backHref?: string
  /** Contêiner do detalhe: modal (padrão) ou painel ancorado (mini-player). */
  variant?: "modal" | "panel"
}

export function TaskDetailDialog({ taskId, clinics, profiles, categories, onClose, onStatusChange, onDeleted, onPinned, onChanged, currentUserId = null, asPage = false, backHref = "/tarefas", variant = "modal" }: TaskDetailDialogProps) {
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [task, setTask] = useState<TaskRow | null>(null)
  const [subtasks, setSubtasks] = useState<TaskRow[]>([])
  const [blockers, setBlockers] = useState<DependencyTaskRow[]>([])
  const [blocking, setBlocking] = useState<DependencyTaskRow[]>([])
  const [attachments, setAttachments] = useState<TaskAttachmentRow[]>([])
  const [activity, setActivity] = useState<TaskActivityRow[]>([])

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [comment, setComment] = useState("")
  const [newSubtask, setNewSubtask] = useState("")
  const [suggested, setSuggested] = useState<string[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  // Linhas "pendentes" das criações — aparecem na hora (esmaecidas, sem ações) e
  // somem quando o refetch traz a versão real. Evita expor id temporário a ações.
  const [pendingSubtasks, setPendingSubtasks] = useState<{ id: string; title: string }[]>([])
  const [pendingUploads, setPendingUploads] = useState<{ id: string; name: string }[]>([])
  const [pendingComments, setPendingComments] = useState<{ id: string; body: string }[]>([])
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState("")
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null)
  const [editingAttachmentName, setEditingAttachmentName] = useState("")
  // URLs assinadas dos anexos de imagem (para thumbnail/lightbox) e a imagem aberta.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  // Comentário: textarea + autocomplete de @menção (query = texto após o "@").
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null)
  const [activityFilter, setActivityFilter] = useState<"all" | "comment" | "system">("all")
  // Instante da última carga da atividade — base estável para a janela de edição
  // de 30 min sem chamar Date.now() durante o render (o servidor revalida o limite).
  const [activityLoadedAt, setActivityLoadedAt] = useState(0)
  // Marca que houve alteração; o board só é re-sincronizado ao fechar (uma vez),
  // em vez de um refetch de página inteira a cada micro-edição.
  const changedRef = useRef(false)
  const doneSubtasks = subtasks.filter((s) => s.status === "concluida").length
  const profileNames = profiles.map((p) => p.name).filter((n): n is string => !!n)

  async function reload(id: string) {
    const [t, subs, blks, blkg, atts, acts] = await Promise.all([
      getTask(id),
      listSubtasks(id),
      listBlockers(id),
      listBlocking(id),
      listTaskAttachments(id),
      listTaskActivity(id),
    ])
    setTask(t)
    setSubtasks(subs)
    setBlockers(blks)
    setBlocking(blkg)
    setAttachments(atts)
    setActivity(acts)
    setActivityLoadedAt(Date.now())
    if (t) {
      setTitle(t.title)
      setDescription(t.description ?? "")
    }
  }

  // Reset ao trocar a tarefa alvo (padrão render-time, sem efeito).
  const [prevTaskId, setPrevTaskId] = useState<string | null>(null)
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId)
    setPendingSubtasks([])
    setPendingUploads([])
    setPendingComments([])
    setNewSubtask("")
    if (taskId) {
      setLoading(true)
    } else {
      setTask(null)
      setSuggested(null)
    }
  }

  useEffect(() => {
    if (!taskId) return
    changedRef.current = false
    startTransition(() => reload(taskId).finally(() => setLoading(false)))
  }, [taskId])

  // Colar print (Ctrl+V) com o diálogo aberto vira anexo. Se o clipboard não
  // tiver imagem (colar texto num campo), deixa o Ctrl+V seguir normal.
  useEffect(() => {
    if (!taskId) return
    function onPaste(e: ClipboardEvent) {
      const imgs = imageFilesFromClipboard(e.clipboardData)
      if (!imgs.length) return
      e.preventDefault()
      uploadFiles(imgs)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  // Busca as URLs assinadas dos anexos de imagem para exibir thumbnail. Re-roda
  // só quando o conjunto de imagens muda (a chave é o join dos ids).
  const imageAttachmentIds = attachments.filter(isImageAttachment).map((a) => a.id).join(",")
  useEffect(() => {
    const imgs = attachments.filter(isImageAttachment)
    if (imgs.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const a of imgs) {
        const res = await getTaskAttachmentUrl(a.id)
        if (!cancelled && res.ok) setImageUrls((prev) => ({ ...prev, [a.id]: res.url }))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageAttachmentIds])

  // Fecha o dialog e, se algo mudou, sincroniza o board uma única vez.
  function handleClose() {
    if (changedRef.current) {
      changedRef.current = false
      onChanged()
    }
    onClose()
  }

  function refreshAll() {
    if (taskId) startTransition(() => reload(taskId))
    changedRef.current = true
  }

  function saveField(patch: Parameters<typeof updateTask>[1]) {
    if (!taskId) return
    // Otimista: aplica a mudança no dialog na hora; o board re-sincroniza ao fechar
    // (changedRef). Reverte só se o servidor recusar.
    const snapshot = task
    setTask((t) => {
      if (!t) return t
      const next = { ...t }
      if (patch.title !== undefined) next.title = patch.title.trim()
      if (patch.description !== undefined) next.description = patch.description?.trim() || null
      if (patch.category !== undefined) next.category = patch.category
      if (patch.priority !== undefined) next.priority = patch.priority
      if (patch.assigneeIds !== undefined) {
        next.assignees = patch.assigneeIds.map((id) => ({
          id,
          name: profiles.find((p) => p.id === id)?.name ?? null,
        }))
      }
      if (patch.dueDate !== undefined) next.due_date = patch.dueDate || null
      if (patch.clinicId !== undefined) {
        next.clinic_id = patch.clinicId
        next.clinic_name = patch.clinicId
          ? clinics.find((c) => c.id === patch.clinicId)?.name ?? null
          : null
      }
      if (patch.isInternal !== undefined) {
        next.is_internal = patch.isInternal
        if (patch.isInternal) {
          next.clinic_id = null
          next.clinic_name = null
        }
      }
      return next
    })
    changedRef.current = true
    startTransition(async () => {
      const res = await updateTask(taskId, patch)
      if (!res.ok) {
        setTask(snapshot)
        toast.error(res.error)
      }
    })
  }

  function changeStatus(status: TaskStatus) {
    if (!taskId) return
    // Otimista: reflete no board e no próprio dialog na hora, sem esperar o servidor.
    // Reverte se o servidor recusar (ex.: bloqueio rígido por dependência aberta —
    // ver ADR 0008) — sem isso o dialog ficava mostrando um status que não colou.
    const snapshot = task
    onStatusChange?.(taskId, status)
    setTask((t) =>
      t ? { ...t, status, completed_at: status === "concluida" ? new Date().toISOString() : null } : t,
    )
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, status)
      if (res.ok) {
        refreshAll()
      } else {
        setTask(snapshot)
        onStatusChange?.(taskId, snapshot?.status ?? status)
        toast.error(res.error)
      }
    })
  }

  async function remove() {
    if (!taskId) return
    const ok = await confirm({
      title: "Excluir tarefa?",
      description: "A tarefa é removida em definitivo — não vai para as arquivadas e não dá para recuperar.",
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    const id = taskId
    startTransition(async () => {
      const res = await deleteTask(id)
      if (res.ok) {
        toast.success("Tarefa excluída.")
        // Otimista: remove do board na hora (sem refetch) e fecha.
        onDeleted?.(id)
        onClose()
      } else toast.error(res.error)
    })
  }

  function askAiBreakdown() {
    if (!description.trim()) {
      toast.error("Escreva a descrição do que precisa ser feito primeiro.")
      return
    }
    startTransition(async () => {
      const res = await suggestSubtasks(description)
      if (res.ok) setSuggested(res.titles)
      else toast.error(res.error)
    })
  }

  function confirmSubtasks() {
    if (!taskId || !suggested?.length) return
    const id = taskId
    const titles = suggested
    // Aparecem como linhas pendentes na hora; o refetch troca pelas reais.
    const pend = titles.map((title, i) => ({ id: `pend-sub-${Date.now()}-${i}`, title }))
    setPendingSubtasks((prev) => [...prev, ...pend])
    setSuggested(null)
    startTransition(async () => {
      const res = await createSubtasks(id, titles)
      if (res.ok) {
        toast.success("Subtarefas criadas.")
        await reload(id)
      } else {
        toast.error(res.error)
      }
      const pendIds = new Set(pend.map((p) => p.id))
      setPendingSubtasks((prev) => prev.filter((p) => !pendIds.has(p.id)))
    })
  }

  function applyPin(id: string, pinnedAt: string | null) {
    const snapshot = task
    setTask((t) => (t ? { ...t, pinned_at: pinnedAt } : t))
    onPinned?.(id, pinnedAt)
    startTransition(async () => {
      const res = await pinTask(id, pinnedAt != null)
      if (!res.ok) {
        setTask(snapshot)
        onPinned?.(id, snapshot?.pinned_at ?? null)
        toast.error(res.error)
        return
      }
      // Carimbo real do servidor (a ordem do bloco "Em foco" usa pinned_at).
      setTask((t) => (t ? { ...t, pinned_at: res.pinnedAt } : t))
      onPinned?.(id, res.pinnedAt)
    })
  }

  function handlePin(pinned: boolean) {
    if (!taskId) return
    const id = taskId
    const prev = task?.pinned_at ?? null
    const title = task?.title
    applyPin(id, pinned ? new Date().toISOString() : null)
    toast.success(pinned ? "Fixada em foco" : "Removida do foco", {
      description: title,
      action: { label: "Desfazer", onClick: () => applyPin(id, prev) },
    })
  }

  function addSubtask() {
    const title = newSubtask.trim()
    if (!taskId) return
    if (title.length < 3) {
      toast.error("Título muito curto (mín. 3 caracteres).")
      return
    }
    const id = taskId
    const pendId = `pend-sub-${Date.now()}`
    setPendingSubtasks((prev) => [...prev, { id: pendId, title }])
    setNewSubtask("")
    startTransition(async () => {
      const res = await createSubtasks(id, [title], "manual")
      if (res.ok) {
        await reload(id)
      } else {
        setNewSubtask(title)
        toast.error(res.error)
      }
      setPendingSubtasks((prev) => prev.filter((p) => p.id !== pendId))
    })
  }

  function changeSubtaskStatus(subtaskId: string, status: TaskStatus) {
    const snapshot = subtasks
    setSubtasks((prev) =>
      prev.map((s) =>
        s.id === subtaskId
          ? { ...s, status, completed_at: status === "concluida" ? new Date().toISOString() : null }
          : s,
      ),
    )
    startTransition(async () => {
      const res = await updateTaskStatus(subtaskId, status)
      if (!res.ok) {
        setSubtasks(snapshot)
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
    if (!files.length || !taskId) return
    const id = taskId
    // Cada arquivo vira uma linha pendente na hora; o refetch ao final troca pelas reais.
    const pend = files.map((f, i) => ({ id: `pend-up-${Date.now()}-${i}`, name: f.name }))
    setPendingUploads((prev) => [...prev, ...pend])
    setUploading(true)
    setUploadProgress({ done: 0, total: files.length })
    let failed = 0
    try {
      for (const file of files) {
        try {
          const signed = await createTaskAttachmentUploadUrl(id, file.name)
          if (!signed.ok) throw new Error(signed.error)
          const supabase = createClient()
          const { error } = await supabase.storage
            .from(TASK_ATTACHMENTS_BUCKET)
            .uploadToSignedUrl(signed.path, signed.token, file)
          if (error) throw new Error(error.message)
          const confirmed = await confirmTaskAttachment({
            taskId: id,
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
        await reload(id)
      }
    } finally {
      setUploading(false)
      setUploadProgress(null)
      const pendIds = new Set(pend.map((p) => p.id))
      setPendingUploads((prev) => prev.filter((p) => !pendIds.has(p.id)))
    }
  }

  async function downloadAttachment(id: string) {
    const res = await getTaskAttachmentUrl(id)
    if (res.ok) window.open(res.url, "_blank")
    else toast.error(res.error)
  }

  async function removeAttachment(id: string) {
    const ok = await confirm({
      title: "Remover anexo?",
      description: "O arquivo é apagado do armazenamento e não pode ser recuperado.",
      confirmLabel: "Remover",
      destructive: true,
    })
    if (!ok) return
    const snapshot = attachments
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    startTransition(async () => {
      const res = await deleteTaskAttachment(id)
      if (!res.ok) {
        setAttachments(snapshot)
        toast.error(res.error)
      }
    })
  }

  function handleStartRenameAttachment(id: string, name: string) {
    setEditingAttachmentId(id)
    setEditingAttachmentName(name)
  }

  function submitAttachmentRename(id: string) {
    const name = editingAttachmentName.trim()
    if (!name) return
    // Otimista: o novo nome aparece na hora; reverte só se o servidor recusar.
    const snapshot = attachments
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, file_name: name } : a)))
    setEditingAttachmentId(null)
    setEditingAttachmentName("")
    startTransition(async () => {
      const res = await renameTaskAttachment(id, name)
      if (!res.ok) {
        setAttachments(snapshot)
        toast.error(res.error)
      }
    })
  }

  const mentionCandidates =
    mention
      ? profiles
          .filter((p) => p.name && p.name.toLowerCase().includes(mention.query.toLowerCase()))
          .slice(0, 6)
      : []

  function onCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setComment(v)
    const caret = e.target.selectionStart ?? v.length
    const m = v.slice(0, caret).match(/@([\p{L}\p{N}._-]*)$/u)
    setMention(m ? { query: m[1], start: caret - m[0].length } : null)
  }

  function insertMention(p: ProfileOption) {
    if (!mention) return
    const name = p.name ?? ""
    const el = commentRef.current
    const caret = el?.selectionStart ?? comment.length
    const next = `${comment.slice(0, mention.start)}@${name} ${comment.slice(caret)}`
    setComment(next)
    setMention(null)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = mention.start + name.length + 2
      el?.setSelectionRange(pos, pos)
    })
  }

  function onCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionCandidates.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault()
      insertMention(mentionCandidates[0])
      return
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submitComment()
      return
    }
    if (e.key === "Escape" && mention) setMention(null)
  }

  function submitComment() {
    if (!taskId || !comment.trim()) return
    const id = taskId
    const body = comment.trim()
    // Resolve os @mencionados: perfis cujo "@Nome" aparece no corpo (sem colar em
    // outra palavra). É a mesma leitura do renderMentions, só que devolvendo ids
    // para o servidor notificar.
    const mentionedIds = profiles
      .filter((p) => {
        if (!p.name) return false
        const esc = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        return new RegExp(`@${esc}(?![\\p{L}\\p{N}])`, "u").test(body)
      })
      .map((p) => p.id)
    const tempId = `pend-cmt-${Date.now()}`
    setMention(null)
    // Aparece na hora como comentário pendente; o refetch troca pelo real.
    setPendingComments((prev) => [...prev, { id: tempId, body }])
    setComment("")
    startTransition(async () => {
      const res = await addTaskComment(id, body, mentionedIds)
      if (res.ok) {
        await reload(id)
        setPendingComments((prev) => prev.filter((p) => p.id !== tempId))
      } else {
        setPendingComments((prev) => prev.filter((p) => p.id !== tempId))
        setComment(body)
        toast.error(res.error)
      }
    })
  }

  function handleEditComment(id: string, body: string) {
    setEditingCommentId(id)
    setEditingCommentText(body)
  }

  function submitCommentEdit(id: string) {
    const text = editingCommentText.trim()
    if (!text) return
    const snapshot = activity
    const editedAt = new Date().toISOString()
    setActivity((prev) => prev.map((a) => (a.id === id ? { ...a, body: text, updated_at: editedAt } : a)))
    setEditingCommentId(null)
    setEditingCommentText("")
    startTransition(async () => {
      const res = await updateTaskComment(id, text)
      if (!res.ok) {
        setActivity(snapshot)
        toast.error(res.error)
      }
    })
  }

  async function handleDeleteComment(id: string) {
    const ok = await confirm({
      title: "Excluir comentário?",
      description: "Esta ação removerá o comentário permanentemente.",
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    const snapshot = activity
    setActivity((prev) => prev.filter((a) => a.id !== id))
    startTransition(async () => {
      const res = await deleteTaskComment(id)
      if (res.ok) {
        toast.success("Comentário excluído.")
      } else {
        setActivity(snapshot)
        toast.error(res.error)
      }
    })
  }

  // ── Seções de conteúdo (compartilhadas entre o modal e a página 1b) ──────────
  // Um TaskDetailDialog é sempre página OU modal — então `asPage` pode ditar uma
  // escala maior no modo página sem afetar o modal (que segue compacto).
  const secCard = `flex flex-col rounded-lg border border-border/60 ${asPage ? "gap-3 p-5" : "gap-2 p-3"}`
  const rowText = asPage ? "text-[0.95rem]" : "text-sm"
  const descriptionField = (
    <label className={`flex flex-col gap-1.5 text-muted-foreground ${asPage ? "text-[0.8rem]" : "text-xs"}`}>
      Descrição — o que precisa ser feito
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (task && description !== (task.description ?? "")) saveField({ description })
        }}
        rows={asPage ? 4 : 3}
        placeholder="Descreva a tarefa com detalhe suficiente para a IA conseguir quebrar em passos, se precisar."
        className={`w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-ring ${asPage ? "text-[0.95rem] leading-relaxed" : "text-sm"}`}
      />
    </label>
  )

  const dependencyBlock = taskId ? (
    <DependencySection taskId={taskId} blockers={blockers} blocking={blocking} onChanged={refreshAll} />
  ) : null

  const subtasksBlock = (
              <div className={secCard}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Subtarefas {subtasks.length > 0 && `(${subtasks.length})`}
                  </p>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={askAiBreakdown}>
                    <Sparkles className="size-3.5" />
                    Dividir com IA
                  </Button>
                </div>

                {subtasks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.round((doneSubtasks / subtasks.length) * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[0.68rem] tabular-nums text-muted-foreground">
                      {doneSubtasks}/{subtasks.length}
                    </span>
                  </div>
                )}

                {suggested && (
                  <div className="flex flex-col gap-1.5 rounded-md bg-amber-500/5 border border-amber-500/30 p-2.5">
                    <p className="text-[0.68rem] text-muted-foreground">
                      Sugestão da IA — remova o que não fizer sentido antes de criar:
                    </p>
                    <ul className="flex flex-col gap-1">
                      {suggested.map((t, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <span className="flex-1">{t}</span>
                          <button
                            type="button"
                            onClick={() => setSuggested((prev) => prev!.filter((_, idx) => idx !== i))}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setSuggested(null)}>
                        Cancelar
                      </Button>
                      <Button type="button" size="sm" disabled={pending || !suggested.length} onClick={confirmSubtasks}>
                        Criar {suggested.length} subtarefa{suggested.length !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  </div>
                )}

                {(subtasks.length > 0 || pendingSubtasks.length > 0) && (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {pendingSubtasks.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm opacity-60">
                        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        <span className="flex-1">{p.title}</span>
                      </li>
                    ))}
                    {subtasks.map((s) => (
                      <li key={s.id} className={`flex items-center gap-2 ${asPage ? "py-2.5" : "py-1.5"} ${rowText}`}>
                        <Link
                          href={`/tarefas/${s.id}`}
                          title="Abrir subtarefa (responsável, prazo, anexos…)"
                          className={`min-w-0 flex-1 truncate hover:underline ${s.status === "concluida" ? "text-muted-foreground line-through" : "text-foreground"}`}
                        >
                          {s.title}
                        </Link>
                        {s.assignees.length > 0 && (
                          <span className="hidden shrink-0 text-[0.62rem] text-muted-foreground sm:inline">
                            {s.assignees.map((a) => a.name).filter(Boolean).join(", ")}
                          </span>
                        )}
                        {s.due_date && (
                          <span className="shrink-0 text-[0.62rem] tabular-nums text-muted-foreground">
                            {fmtShortDate(s.due_date)}
                          </span>
                        )}
                        <Select
                          value={s.status}
                          items={Object.fromEntries(TASK_STATUSES.map((st) => [st, TASK_STATUS_LABEL[st]]))}
                          onValueChange={(v) => v && changeSubtaskStatus(s.id, v as TaskStatus)}
                        >
                          <SelectTrigger className="h-8 min-w-[8rem] text-xs sm:h-6 sm:text-[0.7rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((st) => (
                              <SelectItem key={st} value={st}>
                                {TASK_STATUS_LABEL[st]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                  <Input
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                    placeholder="Adicionar subtarefa…"
                    className="h-8 flex-1"
                  />
                  <Button type="button" size="icon-sm" disabled={pending || !newSubtask.trim()} onClick={addSubtask} title="Adicionar subtarefa">
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
  )

  const anexosBlock = (
              <div className={secCard}>
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
                      <li key={a.id} className={`group flex items-center gap-2 rounded px-1.5 transition-colors hover:bg-accent/10 ${asPage ? "py-2.5" : "py-2"} ${rowText}`}>
                        {editingAttachmentId === a.id ? (
                          <div className="flex flex-1 items-center gap-1.5">
                            <Input
                              value={editingAttachmentName}
                              onChange={(e) => setEditingAttachmentName(e.target.value)}
                              className="h-7 text-xs flex-1"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitAttachmentRename(a.id)
                                if (e.key === "Escape") setEditingAttachmentId(null)
                              }}
                              autoFocus
                            />
                            <Button
                              type="button"
                              size="icon-sm"
                              className="size-7"
                              disabled={pending || !editingAttachmentName.trim()}
                              onClick={() => submitAttachmentRename(a.id)}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="size-7"
                              onClick={() => setEditingAttachmentId(null)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            {isImageAttachment(a) && imageUrls[a.id] && (
                              <button
                                type="button"
                                onClick={() => setLightbox({ url: imageUrls[a.id], name: a.file_name })}
                                className="shrink-0 overflow-hidden rounded border border-border/60 transition-opacity hover:opacity-80"
                                title="Ver imagem"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imageUrls[a.id]} alt={a.file_name} className="size-10 object-cover" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => downloadAttachment(a.id)}
                              className="flex-1 truncate text-left text-brand-gradient hover:opacity-85"
                              title="Baixar anexo"
                            >
                              {a.file_name}
                            </button>
                            <span className="shrink-0 text-[0.68rem] text-muted-foreground">{fmtBytes(a.size_bytes)}</span>
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-foreground"
                                title="Renomear anexo"
                                onClick={() => handleStartRenameAttachment(a.id, a.file_name)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-red-400"
                                aria-label="Excluir anexo"
                                onClick={() => removeAttachment(a.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
  )

  const atividadeBlock = (
              <div className={secCard}>
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atividade</p>
                  <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-[0.7rem] bg-accent/10">
                    <button
                      type="button"
                      onClick={() => setActivityFilter("all")}
                      className={`rounded px-1.5 py-0.5 transition-colors ${activityFilter === "all" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityFilter("comment")}
                      className={`rounded px-1.5 py-0.5 transition-colors ${activityFilter === "comment" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Comentários
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityFilter("system")}
                      className={`rounded px-1.5 py-0.5 transition-colors ${activityFilter === "system" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Histórico
                    </button>
                  </div>
                </div>
                <ul className={`flex flex-col gap-2 overflow-y-auto pr-1 ${asPage ? "max-h-none" : "max-h-52"}`}>
                  {activity
                    .filter((a) => activityFilter === "all" || a.kind === activityFilter)
                    .map((a) => {
                    const canEditOrDelete = a.kind === "comment" &&
                      a.author_id === currentUserId &&
                      (activityLoadedAt - new Date(a.created_at).getTime()) < 30 * 60 * 1000

                    return (
                      <li key={a.id} className={`group flex flex-col gap-0.5 rounded-md p-1.5 transition-colors hover:bg-accent/20 ${a.kind === "system" ? "text-xs text-muted-foreground italic" : "text-sm"}`}>
                        {editingCommentId === a.id ? (
                          <div className="flex flex-col gap-1.5 w-full mt-1">
                            <textarea
                              value={editingCommentText}
                              onChange={(e) => setEditingCommentText(e.target.value)}
                              className="w-full min-h-[3rem] resize-y rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setEditingCommentId(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={pending || !editingCommentText.trim()}
                                onClick={() => submitCommentEdit(a.id)}
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {a.kind === "comment" && <span className="font-semibold text-xs text-muted-foreground mr-1">{a.author_name ?? "Alguém"}: </span>}
                                <span className="break-words">{a.kind === "comment" ? renderMentions(a.body, profileNames) : a.body}</span>
                              </div>
                              
                              {canEditOrDelete && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleEditComment(a.id, a.body)}
                                    title="Editar comentário"
                                    className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(a.id)}
                                    title="Excluir comentário"
                                    className="p-1 hover:text-red-400 text-muted-foreground transition-colors"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground/70 pl-0.5">
                              <span>{fmtDateTime(a.created_at)}</span>
                              {a.updated_at && (
                                <span title={`Editado em: ${fmtDateTime(a.updated_at)}`}>
                                  · (editado)
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                  {(activityFilter === "all" || activityFilter === "comment") &&
                    pendingComments.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5 rounded-md p-1.5 text-sm opacity-60">
                        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                        <span className="break-words">{p.body}</span>
                      </li>
                    ))}
                </ul>
                <div className="relative border-t border-border/40 pt-2">
                  <textarea
                    ref={commentRef}
                    value={comment}
                    onChange={onCommentChange}
                    onKeyDown={onCommentKeyDown}
                    rows={2}
                    placeholder="Comentar…  @ menciona alguém · Enter envia · Shift+Enter quebra linha"
                    className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                  />
                  {mention && mentionCandidates.length > 0 && (
                    <ul className="absolute bottom-full left-2 z-50 mb-1 max-h-44 w-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                      {mentionCandidates.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => insertMention(p)}
                            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                          >
                            <span className="truncate">{p.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1.5 flex justify-end">
                    <Button type="button" size="sm" disabled={pending || !comment.trim()} onClick={submitComment}>
                      <Send className="size-3.5" />
                      Comentar
                    </Button>
                  </div>
                </div>
              </div>
  )

  const lightboxEl = lightbox && (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 p-4"
      onClick={() => setLightbox(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lightbox.url}
        alt={lightbox.name}
        className="max-h-[90vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={() => setLightbox(null)}
        aria-label="Fechar imagem"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70"
      >
        <X className="size-5" />
      </button>
    </div>
  )

  // ── Estado de carregamento ───────────────────────────────────────────────────
  if (loading || !task) {
    const spinner = (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
    if (asPage) return <div className="flex w-full items-center justify-center lg:h-full">{spinner}</div>
    return (
      <Dialog open={taskId != null} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">{spinner}</DialogContent>
      </Dialog>
    )
  }

  // ── Página (direção 1b): rail de detalhes à esquerda + fluxo central ──────────
  if (asPage) {
    return (
      <div className="w-full pb-6 lg:h-full lg:pb-0">
        <div className="flex flex-col gap-5 lg:h-full lg:flex-row lg:items-stretch lg:gap-6">
          <aside className="flex flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-full lg:w-[22rem] lg:flex-none">
            {/* Cabeçalho do rail: origem + título + resumo de estado */}
            <div className="flex shrink-0 flex-col gap-3 border-b border-border p-5">
              {task.clinic_id ? (
                <Link
                  href={`/clinicas/${task.clinic_id}`}
                  className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Building2 className="size-3.5" />
                  {task.clinic_name}
                </Link>
              ) : (
                <span className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="size-3.5" />
                  Tarefa interna
                </span>
              )}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim().length >= 3 && title !== task.title && saveField({ title })}
                className="h-auto border-none px-0 text-2xl font-bold leading-tight shadow-none focus-visible:ring-0"
              />
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${STATUS_PILL[task.status]}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {TASK_STATUS_LABEL[task.status]}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${PRIORITY_PILL[task.priority]}`}>
                  Prioridade {TASK_PRIORITY_LABEL[task.priority].toLowerCase()}
                </span>
                {task.pinned_at && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs text-brand">
                    <Pin className="size-3" />
                    Em foco
                  </span>
                )}
              </div>
            </div>

            {/* Detalhes editáveis (região de scroll do rail no desktop) */}
            <div className="flex flex-col gap-3 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes</p>
              {task.source === "ia" && (
                <span className="w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-400">
                  Origem: IA
                </span>
              )}
              <TaskFields
                clinics={clinics}
                profiles={profiles}
                categories={categories}
                clinicId={task.clinic_id}
                onClinicIdChange={(v) => saveField({ clinicId: v })}
                category={task.category}
                onCategoryChange={(v: TaskCategory) => saveField({ category: v })}
                priority={task.priority}
                onPriorityChange={(v: TaskPriority) => saveField({ priority: v })}
                assigneeIds={task.assignees.map((a) => a.id)}
                onAssigneeIdsChange={(v) => saveField({ assigneeIds: v })}
                isInternal={task.is_internal}
                onIsInternalChange={(v) => saveField({ isInternal: v })}
                dueDate={task.due_date ?? ""}
                onDueDateChange={(v) => saveField({ dueDate: v })}
                status={task.status}
                onStatusChange={changeStatus}
              />
            </div>

            {/* Ações principais fixadas no rodapé do rail */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4">
              {task.status === "concluida" ? (
                <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => changeStatus("pendente")}>
                  <RotateCcw className="size-4" />
                  Reabrir tarefa
                </Button>
              ) : (
                /* Bloqueio rígido (ADR 0008): sem concluir enquanto houver
                   bloqueadora aberta — o aviso âmbar da seção de dependências
                   explica o porquê. */
                <Button
                  type="button"
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
                  disabled={pending || blockers.some((b) => b.status !== "concluida" && b.status !== "cancelada")}
                  title={
                    blockers.some((b) => b.status !== "concluida" && b.status !== "cancelada")
                      ? `Bloqueada por: ${blockers
                          .filter((b) => b.status !== "concluida" && b.status !== "cancelada")
                          .map((b) => b.title)
                          .join(", ")}`
                      : undefined
                  }
                  onClick={() => changeStatus("concluida")}
                >
                  <CheckCircle2 className="size-4" />
                  Concluir tarefa
                </Button>
              )}
              <Button
                type="button"
                variant={task.pinned_at ? "secondary" : "outline"}
                className={`w-full ${task.pinned_at ? "text-brand" : ""}`}
                disabled={pending}
                aria-pressed={task.pinned_at != null}
                onClick={() => handlePin(task.pinned_at == null)}
                title={task.pinned_at ? "Sair do bloco Em foco" : "Fixar no topo da lista (Em foco)"}
              >
                {task.pinned_at ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                {task.pinned_at ? "Soltar do foco" : "Fixar em foco"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-500"
                disabled={pending}
                onClick={remove}
                title="Excluir tarefa"
              >
                <Trash2 className="size-4" />
                Excluir
              </Button>
            </div>
          </aside>

          {/* Fluxo central: descrição, subtarefas, anexos e atividade */}
          <div className="flex min-w-0 flex-1 flex-col gap-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <Link
              href={backHref}
              className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Link>
            {descriptionField}
            {dependencyBlock}
            {subtasksBlock}
            {anexosBlock}
            {atividadeBlock}
          </div>
        </div>
        {lightboxEl}
      </div>
    )
  }

  // ── Corpo de detalhe (coluna única) compartilhado entre modal e painel ───────
  const body = (
    <>
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim().length >= 3 && title !== task.title && saveField({ title })}
            className="flex-1 border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
          {taskId && (
            <Link
              href={`/tarefas/${taskId}`}
              title="Abrir em página"
              aria-label="Abrir em página"
              className="mr-6 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {task.source === "ia" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-400">
                Origem: IA
              </span>
            </div>
          )}
          <TaskFields
            clinics={clinics}
            profiles={profiles}
            categories={categories}
            clinicId={task.clinic_id}
            onClinicIdChange={(v) => saveField({ clinicId: v })}
            isInternal={task.is_internal}
            onIsInternalChange={(v) => saveField({ isInternal: v })}
            category={task.category}
            onCategoryChange={(v: TaskCategory) => saveField({ category: v })}
            priority={task.priority}
            onPriorityChange={(v: TaskPriority) => saveField({ priority: v })}
            assigneeIds={task.assignees.map((a) => a.id)}
            onAssigneeIdsChange={(v) => saveField({ assigneeIds: v })}
            dueDate={task.due_date ?? ""}
            onDueDateChange={(v) => saveField({ dueDate: v })}
            status={task.status}
            onStatusChange={changeStatus}
          />
          {descriptionField}
          {dependencyBlock}
          {subtasksBlock}
          {anexosBlock}
          {atividadeBlock}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {task.status === "concluida" ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => changeStatus("pendente")}>
              <RotateCcw className="size-4" />
              Reabrir tarefa
            </Button>
          ) : (
            /* Mesma regra do rail do modal: bloqueada não conclui (ADR 0008). */
            <Button
              type="button"
              disabled={pending || blockers.some((b) => b.status !== "concluida" && b.status !== "cancelada")}
              title={
                blockers.some((b) => b.status !== "concluida" && b.status !== "cancelada")
                  ? `Bloqueada por: ${blockers
                      .filter((b) => b.status !== "concluida" && b.status !== "cancelada")
                      .map((b) => b.title)
                      .join(", ")}`
                  : undefined
              }
              onClick={() => changeStatus("concluida")}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              <CheckCircle2 className="size-4" />
              Concluir tarefa
            </Button>
          )}
          <div className="mt-2 flex gap-2 sm:mt-0">
            <Button
              type="button"
              variant="outline"
              className={`h-9 px-3 ${task.pinned_at ? "text-brand" : ""}`}
              disabled={pending}
              aria-pressed={task.pinned_at != null}
              aria-label={task.pinned_at ? "Soltar do foco" : "Fixar em foco"}
              onClick={() => handlePin(task.pinned_at == null)}
              title={task.pinned_at ? "Sair do bloco Em foco" : "Fixar no topo da lista (Em foco)"}
            >
              {task.pinned_at ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              <span className="hidden sm:inline">{task.pinned_at ? "Soltar" : "Fixar"}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3 text-red-400 hover:bg-red-500/10 hover:text-red-500"
              disabled={pending}
              onClick={remove}
              title="Excluir tarefa"
            >
              <Trash2 className="mr-1 size-4" />
              Excluir
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        </div>
    </>
  )

  // ── Painel ancorado (mini-player): corpo idêntico, sem backdrop/diálogo ──────
  if (variant === "panel") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {body}
        {lightboxEl}
      </div>
    )
  }

  // ── Modal (mantém o layout de coluna única) ───────────────────────────────────
  return (
    <Dialog open={taskId != null} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {body}
        {lightboxEl}
      </DialogContent>
    </Dialog>
  )
}
