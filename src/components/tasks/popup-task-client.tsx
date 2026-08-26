"use client"

import { X } from "lucide-react"
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog"
import type { ClinicOption, ProfileOption } from "@/components/tasks/task-fields"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

/**
 * Corpo da janela separada ("pop out") de uma tarefa: cabeçalho enxuto (fechar)
 * + o detalhe completo em coluna única (mesmo corpo do painel/mini-player).
 * Fechar usa window.close() — a janela foi aberta por script, então o navegador
 * permite fechá-la.
 */
export function PopupTaskClient({
  taskId,
  clinics,
  profiles,
  categories,
  currentUserId,
  isGestor = false,
}: {
  taskId: string
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  currentUserId: string | null
  /** Etapa de aprovação (ADR 0010): só gestor conclui tarefa interna. */
  isGestor?: boolean
}) {
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tarefa
        </span>
        <button
          type="button"
          onClick={() => window.close()}
          title="Fechar"
          aria-label="Fechar"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <TaskDetailDialog
          variant="panel"
          taskId={taskId}
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          currentUserId={currentUserId}
          isGestor={isGestor}
          onClose={() => window.close()}
          onChanged={() => {}}
        />
      </div>
    </div>
  )
}
