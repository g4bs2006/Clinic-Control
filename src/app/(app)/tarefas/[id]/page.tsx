import { notFound } from "next/navigation"
import { getTask } from "@/lib/tasks/actions"
import { listClinics } from "@/lib/clinics/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { listActiveTaskCategories } from "@/lib/tasks/category-actions"
import { TaskPageClient } from "@/components/tasks/task-page-client"

export const dynamic = "force-dynamic"

// Página dedicada de uma tarefa (deep-link). Reaproveita o corpo do detalhe em
// modo página; os dados de apoio (clínicas/perfis/categorias) espelham /tarefas.
export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [task, clinics, profiles, categories, currentProfile] = await Promise.all([
    getTask(id),
    listClinics(),
    listUserProfiles(),
    listActiveTaskCategories(),
    getCurrentProfile(),
  ])
  if (!task) notFound()

  const clinicOptions = clinics
    .filter((c) => c.contract_status !== "archived")
    .map((c) => ({ id: c.id, name: c.name, developerId: c.developer_id ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const profileOptions = profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))

  return (
    <main className="p-4 sm:p-6">
      <TaskPageClient
        taskId={id}
        clinics={clinicOptions}
        profiles={profileOptions}
        categories={categories}
        currentUserId={currentProfile?.id ?? null}
      />
    </main>
  )
}
