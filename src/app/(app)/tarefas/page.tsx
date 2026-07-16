import { listTasks, listTaskSuggestions } from "@/lib/tasks/actions"
import { listSuggestionJobs } from "@/lib/tasks/generate-actions"
import { listActiveTaskCategories } from "@/lib/tasks/category-actions"
import { materializeRecurrences } from "@/lib/tasks/recurrence-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { Panel } from "@/components/dashboard/panel"
import { TaskBoard } from "@/components/tasks/task-board"

export const dynamic = "force-dynamic"

export default async function TarefasPage() {
  // Materialização sob demanda: ocorrências recorrentes devidas nascem na
  // abertura do dia (idempotente + anti-empilhamento) — antes da listagem.
  await materializeRecurrences()

  const [tasks, suggestions, suggestionJobs, clinics, profiles, categories, currentProfile] = await Promise.all([
    listTasks(),
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
        <h1 className="text-2xl font-bold brand-header">Tarefas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pendências da carteira — manuais ou sugeridas pelos resumos diários da IA
        </p>
      </div>

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
        />
      </Panel>
    </main>
  )
}
