"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2, List, LayoutGrid } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { CreateTaskDialog } from "./create-task-dialog"
import { TaskSuggestions } from "./task-suggestions"
import { TaskDetailDialog } from "./task-detail-dialog"
import { KanbanBoard } from "./kanban-board"
import type { ClinicOption, ProfileOption } from "./task-fields"
import {
  updateTaskStatus,
  deleteTask,
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

interface TaskBoardProps {
  tasks: TaskRow[]
  suggestions: TaskSuggestionRow[]
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  /** Pré-seleciona a clínica no formulário de nova tarefa (painel embutido no perfil da clínica). */
  defaultClinicId?: string | null
}

export function TaskBoard({ tasks, suggestions, clinics, profiles, categories, defaultClinicId = null }: TaskBoardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL)
  const [view, setView] = useState<"list" | "board">("list")
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

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
    startTransition(async () => {
      const res = await updateTaskStatus(id, status)
      if (res.ok) refresh()
      else toast.error(res.error)
    })
  }

  function remove(id: string) {
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

  const filtered = tasks
    .filter((t) => statusFilter === ALL || t.status === statusFilter)
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          items={{ [ALL]: "Todos os status", ...Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABEL[s]])) }}
          onValueChange={(v) => setStatusFilter(v ?? ALL)}
        >
          <SelectTrigger className="h-8 text-sm min-w-[9rem]">
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
          <SelectTrigger className="h-8 text-sm min-w-[9rem]">
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
          <SelectTrigger className="h-8 text-sm min-w-[9rem]">
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

        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            title="Ver como lista"
            onClick={() => setView("list")}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "board" ? "secondary" : "ghost"}
            title="Ver como board"
            onClick={() => setView("board")}
          >
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>

        <div className="flex-1" />
        <CreateTaskDialog
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          defaultClinicId={defaultClinicId}
          onCreated={refresh}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa encontrada para esse filtro.
        </p>
      ) : view === "board" ? (
        <KanbanBoard tasks={filtered} categoryLabel={categoryLabel} onOpen={setOpenTaskId} onStatusChange={changeStatus} />
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {filtered.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span
                className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`}
                title={TASK_PRIORITY_LABEL[t.priority]}
              />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setOpenTaskId(t.id)}
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
                </p>
              </div>

              <Select
                value={t.status}
                items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABEL[s]]))}
                onValueChange={(v) => v && changeStatus(t.id, v as TaskStatus)}
              >
                <SelectTrigger className="h-7 min-w-[9rem] text-xs" disabled={pending}>
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
                onClick={() => remove(t.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <TaskSuggestions
          suggestions={suggestions}
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          onChanged={refresh}
        />
      )}

      <TaskDetailDialog
        taskId={openTaskId}
        clinics={clinics}
        profiles={profiles}
        categories={categories}
        onClose={() => setOpenTaskId(null)}
        onChanged={refresh}
      />
    </div>
  )
}
