import { notFound, redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth/session"
import { getTask } from "@/lib/tasks/actions"
import { listClinics } from "@/lib/clinics/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { listActiveTaskCategories } from "@/lib/tasks/category-actions"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"
import { PopupTaskClient } from "@/components/tasks/popup-task-client"

export const dynamic = "force-dynamic"

// Janela separada ("pop out") de uma tarefa — o mini-player fora do app, que
// continua visível mesmo trocando de aba no navegador. Aberto pelo botão de
// destacar do painel. O middleware já exige sessão (cookie); aqui confirmamos o
// usuário ativo e carregamos o mesmo conjunto de apoio da página /tarefas/[id].
export default async function PopupTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([getSessionUser(), params])
  if (!user) redirect("/login")

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
    <ConfirmProvider>
      <PopupTaskClient
        taskId={id}
        clinics={clinicOptions}
        profiles={profileOptions}
        categories={categories}
        currentUserId={currentProfile?.id ?? null}
      />
    </ConfirmProvider>
  )
}
