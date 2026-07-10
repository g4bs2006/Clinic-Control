"use client"

import { useState } from "react"
import Link from "next/link"
import type { TaskRow } from "@/lib/tasks/actions"
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"

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
}

export function KanbanBoard({ tasks, categoryLabel, onOpen, onStatusChange }: KanbanBoardProps) {
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const byStatus = new Map<TaskStatus, TaskRow[]>(TASK_STATUSES.map((s) => [s, []]))
  for (const t of tasks) byStatus.get(t.status)?.push(t)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TASK_STATUSES.map((status) => {
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
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[0.65rem] text-muted-foreground">
                      <span className="rounded bg-accent/60 px-1 py-0.5">{categoryLabel[t.category] ?? t.category}</span>
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
                      <span className="truncate">{t.assigned_to_name ?? "—"}</span>
                      {t.due_date && (
                        <span className={isOverdue(t) ? "font-semibold text-red-400" : undefined}>
                          {dateLabel(t.due_date)}
                        </span>
                      )}
                    </div>
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
