import { listTasks, listTaskSuggestions, type TaskScope } from "@/lib/tasks/actions"
import { listSuggestionJobs } from "@/lib/tasks/generate-actions"
import { listActiveTaskCategories } from "@/lib/tasks/category-actions"
import { materializeRecurrences } from "@/lib/tasks/recurrence-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { Panel } from "@/components/dashboard/panel"
import { TaskBoard } from "@/components/tasks/task-board"
import { TarefasScopeTabs } from "@/components/tasks/tarefas-scope-tabs"

/**
 * Corpo compartilhado das rotas /tarefas, /tarefas/clinicas e /tarefas/internas
 * (ADR 0009). O escopo recorta a listagem no servidor (listTasks) e ajusta
 * filtros/histórico no TaskBoard. Server component — as páginas herdam
 * `dynamic = "force-dynamic"` de cada rota.
 */
export async function TarefasScopePage({
  scope,
  title,
  subtitle,
}: {
  scope: TaskScope
  title: string
  subtitle: string
}) {
  // Materialização sob demanda: ocorrências recorrentes devidas nascem na
  // abertura do dia (idempotente + anti-empilhamento) — antes da listagem.
  await materializeRecurrences()

  const [tasks, suggestions, suggestionJobs, clinics, profiles, categories, currentProfile] = await Promise.all([
    listTasks({}, scope),
    listTaskSuggestions(),
    listSuggestionJobs(),
    listClinics(),
    listUserProfiles(),
    listActiveTaskCategories(),
    getCurrentProfile(),
  ])

  const clinicOptions = clinics
    .filter((c) => c.contract_status !== "archived")
    .map((c) => ({ id: c.id, name: c.name, developerId: c.developer_id ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  const profileOptions = profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))

  return (
    <main className="p-4 space-y-6 sm:p-6 max-w-screen-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold brand-header">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      <TarefasScopeTabs />

      <Panel>
        <TaskBoard
          tasks={tasks}
          suggestions={suggestions.filter((s) => s.kind !== "acompanhamento")}
          suggestionJobs={suggestionJobs}
          clinics={clinicOptions}
          profiles={profileOptions}
          categories={categories}
          currentUserId={currentProfile?.id ?? null}
          isGestor={currentProfile?.role === "gestor"}
          scope={scope}
        />
      </Panel>
    </main>
  )
}
