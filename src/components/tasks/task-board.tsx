"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2, List, LayoutGrid, CalendarDays, CheckCircle2, Circle, Archive, RotateCcw, SlidersHorizontal, Repeat } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { CreateTaskDialog } from "./create-task-dialog"
import { GenerateSuggestionsDialog } from "./generate-suggestions-dialog"
import { RecurrencesDialog } from "./recurrences-dialog"
import { TaskSuggestions } from "./task-suggestions"
import { TaskDetailDialog } from "./task-detail-dialog"
import { KanbanBoard } from "./kanban-board"
import type { ClinicOption, ProfileOption } from "./task-fields"
import {
  updateTaskStatus,
  bulkUpdateTaskStatus,
  deleteTask,
  listArchivedTasks,
  unarchiveTask,
  type TaskRow,
  type TaskSuggestionRow,
} from "@/lib/tasks/actions"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_RANK,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"
import { agendaBucket, spDateParts, AGENDA_ORDER, AGENDA_LABEL, type AgendaBucket } from "@/lib/tasks/agenda"

const ALL = "__all__"

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgente: "bg-red-400",
  alta: "bg-orange-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-400",
}

const DONE_STATUSES = new Set<TaskStatus>(["concluida", "cancelada"])

function dateLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

function isOverdue(t: TaskRow): boolean {
  if (!t.due_date || DONE_STATUSES.has(t.status)) return false
  return t.due_date < new Date().toISOString().slice(0, 10)
}

/** Linha de tarefa reutilizada nos modos Lista e Semana. */
function TaskListItem({
  t,
  categoryLabel,
  pending,
  onOpen,
  onChangeStatus,
  onRemove,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  t: TaskRow
  categoryLabel: Record<string, string>
  pending: boolean
  onOpen: (id: string) => void
  onChangeStatus: (id: string, status: TaskStatus) => void
  onRemove: (id: string) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const isDone = t.status === "concluida"
  return (
    // Mobile: card com borda (edição de status via detalhe/sheet); desktop: linha densa.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-card p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:py-2.5">
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect?.(t.id)}
          aria-label={`Selecionar tarefa ${t.title}`}
          className="hidden sm:inline-flex"
        />
      )}
      {/* Concluir/reabrir num clique (otimista) */}
      <button
        type="button"
        onClick={() => onChangeStatus(t.id, isDone ? "pendente" : "concluida")}
        title={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
        aria-label={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
        className={`flex size-9 shrink-0 items-center justify-center transition-colors sm:size-6 ${isDone ? "text-emerald-500 hover:text-muted-foreground" : "text-muted-foreground/50 hover:text-emerald-500"}`}
      >
        {isDone ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
      </button>
      <span
        className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`}
        title={TASK_PRIORITY_LABEL[t.priority]}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(t.id)}
          className={`text-left text-sm font-medium hover:underline ${DONE_STATUSES.has(t.status) ? "text-muted-foreground line-through" : ""}`}
        >
          {t.title}
        </button>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="rounded bg-accent/50 px-1.5 py-0.5">{categoryLabel[t.category] ?? t.category}</span>
          {t.clinic_id && t.clinic_name && (
            <>
              ·{" "}
              <Link href={`/clinicas/${t.clinic_id}`} className="hover:text-foreground transition-colors">
                {t.clinic_name}
              </Link>
            </>
          )}
          {t.assigned_to_name && <>· {t.assigned_to_name}</>}
          {t.due_date && (
            <span className={isOverdue(t) ? "font-semibold text-red-400" : undefined}>
              · prazo {dateLabel(t.due_date)}
            </span>
          )}
          {t.source === "ia" && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-400">
              IA
            </span>
          )}
          {t.recurrence_id && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-brand">
              <Repeat className="size-2.5" />
              recorrente
            </span>
          )}
        </p>
      </div>

      <Select
        value={t.status}
        items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABEL[s]]))}
        onValueChange={(v) => v && onChangeStatus(t.id, v as TaskStatus)}
      >
        {/* Select inline só no desktop — no mobile o status muda pelo detalhe (sheet) */}
        <SelectTrigger className="hidden min-w-[9rem] text-xs sm:flex sm:h-7">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        title="Excluir tarefa"
        className="size-9 sm:size-8"
        onClick={() => onRemove(t.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  )
}

interface TaskBoardProps {
  tasks: TaskRow[]
  suggestions: TaskSuggestionRow[]
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  /** Usuário logado — usado na aba "Semana" (agenda pessoal). */
  currentUserId?: string | null
  /** Gestor pode criar regras recorrentes de carteira (fan-out). */
  isGestor?: boolean
  /** Pré-seleciona a clínica no formulário de nova tarefa (painel embutido no perfil da clínica). */
  defaultClinicId?: string | null
}

export function TaskBoard({ tasks: initialTasks, suggestions, clinics, profiles, categories, currentUserId = null, isGestor = false, defaultClinicId = null }: TaskBoardProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  // Cópia local para atualização otimista (arrastar no board / trocar status na
  // lista reflete na hora). Re-sincroniza quando o servidor envia nova lista
  // (criação, exclusão, aceite de sugestão, edição no detalhe — que dão refresh).
  const [tasks, setTasks] = useState(initialTasks)
  // Seleção múltipla da lista (ação em lote). Limpa ao chegar nova lista do servidor.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Re-sincroniza com o servidor (criação, exclusão, aceite de sugestão, edição
  // no detalhe) ajustando o estado durante o render — padrão recomendado do React
  // em vez de setState num efeito (evita render em cascata e flash de dado velho).
  const [prevInitial, setPrevInitial] = useState(initialTasks)
  if (initialTasks !== prevInitial) {
    setPrevInitial(initialTasks)
    setTasks(initialTasks)
    setSelected(new Set())
  }
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL)
  const [view, setView] = useState<"list" | "board" | "week">("list")
  const [showDone, setShowDone] = useState(false)
  // Mobile: filtros recolhidos num botão "Filtros" (no desktop ficam sempre visíveis).
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  // Histórico de arquivadas — carregado sob demanda (null = oculto).
  const [archived, setArchived] = useState<TaskRow[] | null>(null)
  const [archivedPending, startArchivedTransition] = useTransition()

  function toggleArchived() {
    if (archived !== null) {
      setArchived(null)
      return
    }
    startArchivedTransition(async () => {
      try {
        setArchived(await listArchivedTasks())
      } catch {
        toast.error("Falha ao carregar arquivadas.")
      }
    })
  }

  function restore(id: string) {
    startArchivedTransition(async () => {
      const res = await unarchiveTask(id)
      if (res.ok) {
        setArchived((prev) => prev?.filter((t) => t.id !== id) ?? null)
        toast.success("Tarefa restaurada.")
        refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const categoryLabel = Object.fromEntries(categories.map((c) => [c.slug, c.label]))
  // Inclui categorias desativadas que ainda aparecem em alguma tarefa, senão o filtro não acha elas.
  const filterCategories = [
    ...categories,
    ...Array.from(new Set(tasks.map((t) => t.category)))
      .filter((slug) => !categories.some((c) => c.slug === slug))
      .map((slug) => ({ id: slug, slug, label: slug, position: 999, active: false })),
  ]

  function refresh() {
    router.refresh()
  }

  function changeStatus(id: string, status: TaskStatus) {
    // Move na hora (otimista); só re-busca se o servidor recusar.
    const snapshot = tasks
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, status, completed_at: status === "concluida" ? new Date().toISOString() : null }
          : t,
      ),
    )
    startTransition(async () => {
      const res = await updateTaskStatus(id, status)
      if (!res.ok) {
        setTasks(snapshot)
        toast.error(res.error)
      }
    })
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Excluir tarefa?",
      description: "A tarefa é removida em definitivo — não vai para as arquivadas e não dá para recuperar.",
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteTask(id)
      if (res.ok) {
        toast.success("Tarefa excluída.")
        refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function bulkStatus(status: TaskStatus) {
    const ids = [...selected]
    if (!ids.length) return
    const idSet = selected
    const snapshot = tasks
    // Otimista: aplica o novo status nas selecionadas na hora.
    setTasks((ts) =>
      ts.map((t) =>
        idSet.has(t.id)
          ? { ...t, status, completed_at: status === "concluida" ? new Date().toISOString() : null }
          : t,
      ),
    )
    setSelected(new Set())
    startTransition(async () => {
      const res = await bulkUpdateTaskStatus(ids, status)
      if (res.ok) {
        toast.success(
          status === "concluida"
            ? `${res.count} tarefa(s) concluída(s).`
            : `${res.count} tarefa(s) descartada(s).`,
        )
      } else {
        setTasks(snapshot)
        setSelected(idSet)
        toast.error(res.error)
      }
    })
  }

  // Na Lista, esconde concluídas/canceladas por padrão (a menos que o usuário
  // ligue "Mostrar concluídas" ou filtre explicitamente por um status). No Board
  // as colunas Concluída/Cancelada continuam visíveis.
  const hideDone = (view === "list" || view === "board") && !showDone && statusFilter === ALL
  const filtered = tasks
    .filter((t) => statusFilter === ALL || t.status === statusFilter)
    .filter((t) => !(hideDone && DONE_STATUSES.has(t.status)))
    .filter((t) => categoryFilter === ALL || t.category === categoryFilter)
    .filter((t) => priorityFilter === ALL || t.priority === priorityFilter)
    .sort((a, b) => {
      const doneRank = (s: TaskStatus) => (DONE_STATUSES.has(s) ? 1 : 0)
      const doneDiff = doneRank(a.status) - doneRank(b.status)
      if (doneDiff !== 0) return doneDiff
      const prDiff = TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority]
      if (prDiff !== 0) return prDiff
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date < b.due_date ? -1 : 1
    })

  // ── Agenda "Minha semana": só as minhas tarefas abertas, agrupadas por prazo ──
  const { today, endOfWeek } = spDateParts(new Date())
  const myOpenTasks = tasks.filter(
    (t) => t.assigned_to === currentUserId && !DONE_STATUSES.has(t.status),
  )
  const weekGroups = new Map<AgendaBucket, TaskRow[]>(AGENDA_ORDER.map((b) => [b, []]))
  for (const t of myOpenTasks) {
    weekGroups.get(agendaBucket(t.due_date, today, endOfWeek))!.push(t)
  }
  for (const list of weekGroups.values()) {
    list.sort((a, b) => {
      if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
      return TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority]
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* Toggle de filtros — só mobile (no desktop os filtros ficam inline) */}
        {view !== "week" && (
          <Button
            type="button"
            size="sm"
            variant={filtersOpen ? "secondary" : "outline"}
            className="h-9 sm:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-3.5" />
            Filtros
            {(statusFilter !== ALL || categoryFilter !== ALL || priorityFilter !== ALL) &&
              ` (${[statusFilter, categoryFilter, priorityFilter].filter((v) => v !== ALL).length})`}
          </Button>
        )}

        {/* sm:contents: no desktop o wrapper some e os filtros fluem como antes */}
        <div className={filtersOpen ? "flex w-full flex-col gap-2 sm:contents" : "hidden sm:contents"}>
        {view !== "week" && (
          <>
            <Select
              value={statusFilter}
              items={{ [ALL]: "Todos os status", ...Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABEL[s]])) }}
              onValueChange={(v) => setStatusFilter(v ?? ALL)}
            >
              <SelectTrigger className="h-9 flex-1 text-sm min-w-[9rem] sm:h-8 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={categoryFilter}
              items={{ [ALL]: "Todas as categorias", ...Object.fromEntries(filterCategories.map((c) => [c.slug, c.label])) }}
              onValueChange={(v) => setCategoryFilter(v ?? ALL)}
            >
              <SelectTrigger className="h-9 flex-1 text-sm min-w-[9rem] sm:h-8 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as categorias</SelectItem>
                {filterCategories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priorityFilter}
              items={{ [ALL]: "Todas as prioridades", ...Object.fromEntries(TASK_PRIORITIES.map((p) => [p, TASK_PRIORITY_LABEL[p]])) }}
              onValueChange={(v) => setPriorityFilter(v ?? ALL)}
            >
              <SelectTrigger className="h-9 flex-1 text-sm min-w-[9rem] sm:h-8 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as prioridades</SelectItem>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {(view === "list" || view === "board") && (
          <Button
            type="button"
            size="sm"
            variant={showDone ? "secondary" : "outline"}
            onClick={() => setShowDone((v) => !v)}
            title={showDone ? "Ocultar concluídas e canceladas" : "Mostrar concluídas e canceladas"}
          >
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </Button>
        )}

        {view === "list" && (
          <Button
            type="button"
            size="sm"
            variant={archived !== null ? "secondary" : "outline"}
            disabled={archivedPending}
            onClick={toggleArchived}
            title="Histórico de tarefas arquivadas"
          >
            <Archive className="size-3.5" />
            {archived !== null ? "Ocultar arquivadas" : "Arquivadas"}
          </Button>
        )}
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            title="Ver como lista"
            className="size-9 sm:size-7"
            onClick={() => setView("list")}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "board" ? "secondary" : "ghost"}
            title="Ver como board"
            className="size-9 sm:size-7"
            onClick={() => setView("board")}
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "week" ? "secondary" : "ghost"}
            title="Ver minha semana"
            className="size-9 sm:size-7"
            onClick={() => setView("week")}
          >
            <CalendarDays className="size-3.5" />
          </Button>
        </div>

        <div className="flex-1" />
        <GenerateSuggestionsDialog onGenerated={refresh} />
        <RecurrencesDialog
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          isGestor={isGestor}
          onChanged={refresh}
        />
        <CreateTaskDialog
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          defaultClinicId={defaultClinicId}
          currentUserId={currentUserId}
          onCreated={refresh}
        />
      </div>

      {view === "week" ? (
        myOpenTasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Você não tem tarefas em aberto atribuídas a você.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {AGENDA_ORDER.map((bucket) => {
              const items = weekGroups.get(bucket)!
              if (!items.length) return null
              return (
                <div key={bucket}>
                  <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className={bucket === "atrasada" ? "text-red-400" : undefined}>
                      {AGENDA_LABEL[bucket]}
                    </span>
                    <span className="tabular-nums text-[0.68rem] text-muted-foreground/70">{items.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-2 sm:gap-0 sm:divide-y sm:divide-border/40">
                    {items.map((t) => (
                      <TaskListItem
                        key={t.id}
                        t={t}
                        categoryLabel={categoryLabel}
                        pending={pending}
                        onOpen={setOpenTaskId}
                        onChangeStatus={changeStatus}
                        onRemove={remove}
                      />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa encontrada para esse filtro.
        </p>
      ) : view === "board" ? (
        <KanbanBoard tasks={filtered} categoryLabel={categoryLabel} onOpen={setOpenTaskId} onStatusChange={changeStatus} />
      ) : (
        <div className="flex flex-col">
          {/* Cabeçalho de seleção + barra de ação em lote (desktop; no mobile a
              seleção múltipla sai de cena — ações item a item ou pelo detalhe) */}
          <div className="hidden flex-wrap items-center gap-3 border-b border-border/40 pb-2 sm:flex">
            <Checkbox
              checked={filtered.length > 0 && filtered.every((t) => selected.has(t.id))}
              onCheckedChange={(checked) =>
                setSelected(checked ? new Set(filtered.map((t) => t.id)) : new Set())
              }
              aria-label="Selecionar todas"
            />
            {selected.size > 0 ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">
                  {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
                </span>
                <div className="flex-1" />
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => bulkStatus("concluida")}>
                  Concluir ({selected.size})
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => bulkStatus("cancelada")}>
                  Descartar ({selected.size})
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Selecione tarefas para concluir ou descartar em lote</span>
            )}
          </div>

          <ul className="flex flex-col gap-2 sm:gap-0 sm:divide-y sm:divide-border/40">
            {filtered.map((t) => (
              <TaskListItem
                key={t.id}
                t={t}
                categoryLabel={categoryLabel}
                pending={pending}
                onOpen={setOpenTaskId}
                onChangeStatus={changeStatus}
                onRemove={remove}
                selectable
                selected={selected.has(t.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </ul>
        </div>
      )}

      {view === "list" && archived !== null && (
        <div className="rounded-lg border border-border/60 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Arquivadas {archived.length > 0 && `(${archived.length})`}
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/60">
              histórico — seguem no banco; restaure para reativar
            </span>
          </p>
          {archived.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma tarefa arquivada.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {archived.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setOpenTaskId(t.id)}
                      className="block truncate text-left text-sm text-muted-foreground line-through hover:text-foreground"
                    >
                      {t.title}
                    </button>
                    <span className="text-xs text-muted-foreground/70">
                      {categoryLabel[t.category] ?? t.category}
                      {t.clinic_name ? ` · ${t.clinic_name}` : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={archivedPending}
                    onClick={() => restore(t.id)}
                  >
                    <RotateCcw className="size-3.5" />
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <TaskSuggestions
          suggestions={suggestions}
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      )}

      <TaskDetailDialog
        taskId={openTaskId}
        clinics={clinics}
        profiles={profiles}
        categories={categories}
        onClose={() => setOpenTaskId(null)}
        onStatusChange={changeStatus}
        onChanged={refresh}
        currentUserId={currentUserId}
      />
    </div>
  )
}
