"use client"

import { useState } from "react"
import Link from "next/link"
import { Pin, Lock, CheckCircle2, CheckCheck } from "lucide-react"
import type { TaskRow } from "@/lib/tasks/actions"
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"
// Colunas e regra de aprovação (ADR 0011) vêm de um lugar só — o board é o
// mesmo nas três abas de escopo (ADR 0009).
import { KANBAN_STATUSES } from "@/lib/tasks/approval"

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgente: "bg-red-400",
  alta: "bg-orange-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-400",
}

function dateLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

function isOverdue(t: TaskRow): boolean {
  if (!t.due_date || t.status === "concluida" || t.status === "cancelada") return false
  return t.due_date < new Date().toISOString().slice(0, 10)
}

interface KanbanBoardProps {
  tasks: TaskRow[]
  categoryLabel: Record<string, string>
  onOpen: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
  /** Só gestor aprova (em_aprovacao → concluida) — ADR 0011. */
  isGestor?: boolean
}

export function KanbanBoard({ tasks, categoryLabel, onOpen, onStatusChange, isGestor = false }: KanbanBoardProps) {
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // byStatus é indexado por TODOS os status (uma tarefa concluída ainda cai num
  // balde), mas só as colunas de KANBAN_STATUSES são renderizadas — o que está
  // encerrado se vê no Histórico, não aqui.
  const byStatus = new Map<TaskStatus, TaskRow[]>(TASK_STATUSES.map((s) => [s, []]))
  for (const t of tasks) byStatus.get(t.status)?.push(t)
  // As fixadas ("em foco") vão para o topo da coluna — o board não tem bloco
  // próprio como a Lista, então o destaque aqui é a ordem + o pino no card.
  for (const items of byStatus.values()) {
    items.sort((a, b) => (a.pinned_at ? 0 : 1) - (b.pinned_at ? 0 : 1))
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {KANBAN_STATUSES.map((status) => {
        const items = byStatus.get(status) ?? []
        const isOver = dragOverStatus === status
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverStatus(status)
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverStatus(null)
              const id = e.dataTransfer.getData("text/task-id")
              if (id) onStatusChange(id, status)
            }}
            className={`flex flex-col gap-2 rounded-lg border p-2.5 transition-colors ${
              isOver ? "border-brand bg-brand/5" : "border-border/60 bg-accent/10"
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {TASK_STATUS_LABEL[status]}
              </p>
              <span className="text-[0.68rem] tabular-nums text-muted-foreground">{items.length}</span>
            </div>

            <div className="flex flex-col gap-2 min-h-[3rem]">
              {items.map((t) => (
                <div
                  key={t.id}
                  // No touch não há hover — o card fica com opacidade cheia no mobile.
                  className={`rounded-md p-px transition-opacity hover:opacity-100 ${
                    draggingId === t.id ? "opacity-40" : "opacity-100 sm:opacity-70"
                  }`}
                  style={{ background: "var(--brand)" }}
                >
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(t.id)
                      e.dataTransfer.setData("text/task-id", t.id)
                      e.dataTransfer.effectAllowed = "move"
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onOpen(t.id)}
                    className="flex cursor-pointer flex-col gap-1.5 rounded-[calc(var(--radius-md)-1px)] bg-card p-2.5 shadow-sm"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className={`mt-1 size-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                      <p className="text-sm font-medium leading-snug">{t.title}</p>
                      {t.pinned_at && (
                        <span title="Em foco" className="mt-0.5 shrink-0 text-brand">
                          <Pin className="size-3" />
                        </span>
                      )}
                      {t.is_blocked && t.status !== "concluida" && t.status !== "cancelada" && (
                        <span
                          title={
                            t.blocked_by.length
                              ? `Bloqueada por: ${t.blocked_by.map((b) => b.title).join(", ")}`
                              : "Bloqueada por outra tarefa ainda aberta"
                          }
                          className="mt-0.5 shrink-0 text-red-400"
                        >
                          <Lock className="size-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[0.65rem] text-muted-foreground">
                      <span className="rounded bg-accent/60 px-1 py-0.5">{categoryLabel[t.category] ?? t.category}</span>
                      {t.is_internal && (
                        <span className="rounded bg-sky-500/15 px-1 py-0.5 text-sky-400">interna</span>
                      )}
                      {t.clinic_name && (
                        <Link
                          href={`/clinicas/${t.clinic_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate hover:text-foreground transition-colors"
                        >
                          {t.clinic_name}
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
                      <span className="truncate">
                        {t.assignees.map((a) => a.name).filter(Boolean).join(", ") || "—"}
                      </span>
                      {t.due_date && (
                        <span className={isOverdue(t) ? "font-semibold text-red-400" : undefined}>
                          {dateLabel(t.due_date)}
                        </span>
                      )}
                    </div>

                    {/* Etapa de aprovação (ADR 0011): sem coluna "Concluída" pra
                        arrastar — concluir é uma ação explícita. Qualquer papel
                        manda pra "Em aprovação"; o gestor aprova a partir dali. */}
                    {t.status !== "em_aprovacao" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onStatusChange(t.id, "em_aprovacao")
                        }}
                        className="flex items-center justify-center gap-1 rounded-md border border-emerald-500/30 py-1 text-[0.65rem] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-500"
                      >
                        <CheckCircle2 className="size-3" />
                        Concluir
                      </button>
                    )}
                    {isGestor && t.status === "em_aprovacao" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onStatusChange(t.id, "concluida")
                        }}
                        className="flex items-center justify-center gap-1 rounded-md border border-brand/30 py-1 text-[0.65rem] font-medium text-brand transition-colors hover:bg-brand/10"
                      >
                        <CheckCheck className="size-3" />
                        Aprovar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
