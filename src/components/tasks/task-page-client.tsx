"use client"

import { useRouter } from "next/navigation"
import { TaskDetailDialog } from "./task-detail-dialog"
import type { ClinicOption, ProfileOption } from "./task-fields"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

/**
 * Wrapper client da página /tarefas/[id]. Reaproveita o corpo do detalhe da
 * tarefa em modo `asPage` (2ª coluna/layout de página, sem o diálogo). Voltar e
 * excluir navegam de volta à lista; não há board para sincronizar aqui.
 */
export function TaskPageClient({
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
  const router = useRouter()
  return (
    <TaskDetailDialog
      asPage
      taskId={taskId}
      clinics={clinics}
      profiles={profiles}
      categories={categories}
      currentUserId={currentUserId}
      isGestor={isGestor}
      backHref="/tarefas"
      onClose={() => router.push("/tarefas")}
      onDeleted={() => router.push("/tarefas")}
      onChanged={() => {}}
    />
  )
}
