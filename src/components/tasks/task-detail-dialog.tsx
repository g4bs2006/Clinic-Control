"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Sparkles, Paperclip, Trash2, Send, Loader2, X, CheckCircle2, RotateCcw, Pencil, Check } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TaskFields, type ClinicOption, type ProfileOption } from "./task-fields"
import { createClient } from "@/lib/supabase/client"
import {
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
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
  TASK_ATTACHMENTS_BUCKET,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

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

interface TaskDetailDialogProps {
  taskId: string | null
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  onClose: () => void
  /** Reflete a troca de status no board na hora (otimista, sem refetch). */
  onStatusChange?: (id: string, status: TaskStatus) => void
  onChanged: () => void
  currentUserId?: string | null
}

export function TaskDetailDialog({ taskId, clinics, profiles, categories, onClose, onStatusChange, onChanged, currentUserId = null }: TaskDetailDialogProps) {
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [task, setTask] = useState<TaskRow | null>(null)
  const [subtasks, setSubtasks] = useState<TaskRow[]>([])
  const [attachments, setAttachments] = useState<TaskAttachmentRow[]>([])
  const [activity, setActivity] = useState<TaskActivityRow[]>([])

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [comment, setComment] = useState("")
  const [suggested, setSuggested] = useState<string[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState("")
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null)
  const [editingAttachmentName, setEditingAttachmentName] = useState("")
  const [activityFilter, setActivityFilter] = useState<"all" | "comment" | "system">("all")
  // Marca que houve alteração; o board só é re-sincronizado ao fechar (uma vez),
  // em vez de um refetch de página inteira a cada micro-edição.
  const changedRef = useRef(false)

  async function reload(id: string) {
    const [t, subs, atts, acts] = await Promise.all([
      getTask(id),
      listSubtasks(id),
      listTaskAttachments(id),
      listTaskActivity(id),
    ])
    setTask(t)
    setSubtasks(subs)
    setAttachments(atts)
    setActivity(acts)
    if (t) {
      setTitle(t.title)
      setDescription(t.description ?? "")
    }
  }

  useEffect(() => {
    if (!taskId) {
      setTask(null)
      setSuggested(null)
      return
    }
    changedRef.current = false
    setLoading(true)
    reload(taskId).finally(() => setLoading(false))
  }, [taskId])

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
    startTransition(async () => {
      const res = await updateTask(taskId, patch)
      if (res.ok) refreshAll()
      else toast.error(res.error)
    })
  }

  function changeStatus(status: TaskStatus) {
    if (!taskId) return
    // Otimista: reflete no board e no próprio dialog na hora, sem esperar o servidor.
    onStatusChange?.(taskId, status)
    setTask((t) =>
      t ? { ...t, status, completed_at: status === "concluida" ? new Date().toISOString() : null } : t,
    )
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, status)
      if (res.ok) refreshAll()
      else toast.error(res.error)
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
    startTransition(async () => {
      const res = await deleteTask(taskId)
      if (res.ok) {
        toast.success("Tarefa excluída.")
        changedRef.current = true
        handleClose()
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
    startTransition(async () => {
      const res = await createSubtasks(taskId, suggested)
      if (res.ok) {
        toast.success("Subtarefas criadas.")
        setSuggested(null)
        refreshAll()
      } else toast.error(res.error)
    })
  }

  function changeSubtaskStatus(subtaskId: string, status: TaskStatus) {
    startTransition(async () => {
      const res = await updateTaskStatus(subtaskId, status)
      if (res.ok) refreshAll()
      else toast.error(res.error)
    })
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !taskId) return
    setUploading(true)
    try {
      const signed = await createTaskAttachmentUploadUrl(taskId, file.name)
      if (!signed.ok) throw new Error(signed.error)
      const supabase = createClient()
      const { error } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, file)
      if (error) throw new Error(error.message)
      const confirmed = await confirmTaskAttachment({
        taskId,
        filePath: signed.path,
        fileName: file.name,
        contentType: file.type || null,
        sizeBytes: file.size,
      })
      if (!confirmed.ok) throw new Error(confirmed.error)
      toast.success("Anexo enviado.")
      refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload")
    } finally {
      setUploading(false)
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
    startTransition(async () => {
      const res = await deleteTaskAttachment(id)
      if (res.ok) refreshAll()
      else toast.error(res.error)
    })
  }

  function handleStartRenameAttachment(id: string, name: string) {
    setEditingAttachmentId(id)
    setEditingAttachmentName(name)
  }

  function submitAttachmentRename(id: string) {
    const name = editingAttachmentName.trim()
    if (!name) return
    startTransition(async () => {
      const res = await renameTaskAttachment(id, name)
      if (res.ok) {
        setEditingAttachmentId(null)
        setEditingAttachmentName("")
        refreshAll()
      } else {
        toast.error(res.error)
      }
    })
  }

  function submitComment() {
    if (!taskId || !comment.trim()) return
    startTransition(async () => {
      const res = await addTaskComment(taskId, comment)
      if (res.ok) {
        setComment("")
        refreshAll()
      } else toast.error(res.error)
    })
  }

  function handleEditComment(id: string, body: string) {
    setEditingCommentId(id)
    setEditingCommentText(body)
  }

  function submitCommentEdit(id: string) {
    const text = editingCommentText.trim()
    if (!text) return
    startTransition(async () => {
      const res = await updateTaskComment(id, text)
      if (res.ok) {
        setEditingCommentId(null)
        setEditingCommentText("")
        refreshAll()
      } else {
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
    startTransition(async () => {
      const res = await deleteTaskComment(id)
      if (res.ok) {
        toast.success("Comentário excluído.")
        refreshAll()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={taskId != null} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {loading || !task ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim().length >= 3 && title !== task.title && saveField({ title })}
                className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              />
            </DialogHeader>

            <div className="flex flex-col gap-5">
              {/* ── Metadados ─────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-2">
                {task.source === "ia" && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-400">
                    Origem: IA
                  </span>
                )}
                <div className="flex-1" />
                <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={remove} title="Excluir tarefa">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

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
                assignedTo={task.assigned_to}
                onAssignedToChange={(v) => saveField({ assignedTo: v })}
                dueDate={task.due_date ?? ""}
                onDueDateChange={(v) => saveField({ dueDate: v })}
                status={task.status}
                onStatusChange={changeStatus}
              />

              {/* ── Descrição ─────────────────────────────────────── */}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Descrição — o que precisa ser feito
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => description !== (task.description ?? "") && saveField({ description })}
                  rows={3}
                  placeholder="Descreva a tarefa com detalhe suficiente para a IA conseguir quebrar em passos, se precisar."
                  className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                />
              </label>

              {/* ── Subtarefas ────────────────────────────────────── */}
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Subtarefas {subtasks.length > 0 && `(${subtasks.length})`}
                  </p>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={askAiBreakdown}>
                    <Sparkles className="size-3.5" />
                    Dividir com IA
                  </Button>
                </div>

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

                {subtasks.length > 0 && (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {subtasks.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className={`flex-1 ${s.status === "concluida" ? "text-muted-foreground line-through" : ""}`}>
                          {s.title}
                        </span>
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
              </div>

              {/* ── Anexos ────────────────────────────────────────── */}
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Anexos {attachments.length > 0 && `(${attachments.length})`}
                  </p>
                  <label className={buttonVariants({ size: "sm", variant: "outline", className: "cursor-pointer" })}>
                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
                    Anexar arquivo
                    <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                  </label>
                </div>
                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {attachments.map((a) => (
                      <li key={a.id} className="group flex items-center gap-2 py-2 text-sm transition-colors hover:bg-accent/10 rounded px-1.5">
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

              {/* ── Atividade ─────────────────────────────────────── */}
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
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
                <ul className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                  {activity
                    .filter((a) => activityFilter === "all" || a.kind === activityFilter)
                    .map((a) => {
                    const canEditOrDelete = a.kind === "comment" &&
                      a.author_id === currentUserId &&
                      (Date.now() - new Date(a.created_at).getTime()) < 30 * 60 * 1000

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
                                <span className="break-words">{a.body}</span>
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

            <DialogFooter className="sm:justify-between">
              {task.status === "concluida" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => changeStatus("pendente")}
                >
                  <RotateCcw className="size-4" />
                  Reabrir tarefa
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => changeStatus("concluida")}
                  className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                >
                  <CheckCircle2 className="size-4" />
                  Concluir tarefa
                </Button>
              )}
              <DialogClose className={buttonVariants({ variant: "outline" })}>Fechar</DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
