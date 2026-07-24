// Aba "Tarefas & Checklist" — categorias de tarefa, checklist de clínicas e
// diagnóstico pós-onboarding.
import { getCurrentProfile } from "@/lib/users/actions"
import { listTaskCategories } from "@/lib/tasks/category-actions"
import { listManagedCheckItems } from "@/lib/clinics/check-items-actions"
import { listCheckCategories } from "@/lib/clinics/check-categories-actions"
import { Panel } from "@/components/dashboard/panel"
import { CollapsiblePanel } from "@/components/dashboard/collapsible-panel"
import { TaskCategoriesEditor } from "@/components/settings/task-categories-editor"
import { CheckItemsEditor } from "@/components/settings/check-items-editor"
import { CheckCategoriesEditor } from "@/components/settings/check-categories-editor"
import { OnboardingDiagnostic } from "@/components/settings/onboarding-diagnostic"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesTarefasPage() {
  const [taskCategories, checkItems, checkCategories, currentProfile] = await Promise.all([
    listTaskCategories(),
    listManagedCheckItems(),
    listCheckCategories(),
    getCurrentProfile(),
  ])
  const isGestor = currentProfile?.role === "gestor"

  return (
    <>
      <Panel
        title="Categorias de tarefa"
        subtitle="usadas em /tarefas e no painel de tarefas de cada clínica"
      >
        <TaskCategoriesEditor initialCategories={taskCategories} readOnly={!isGestor} />
      </Panel>

      <Panel
        title="Meu checklist de clínicas"
        subtitle={
          isGestor
            ? "seus itens pessoais + todos os fixos (compartilhados entre gestores) — marque “Fixo” para valer em todas as clínicas, para todos"
            : "itens pessoais — cada usuário tem os seus; aparecem em todas as clínicas só para você"
        }
      >
        <CheckItemsEditor
          initialItems={checkItems}
          categories={checkCategories}
          canMakeGlobal={isGestor}
        />
      </Panel>

      {isGestor && (
        <Panel
          title="Categorias do checklist"
          subtitle="organizam os itens por etapa (ex.: Painéis, n8n, Agente de IA, Chatbot)"
        >
          <CheckCategoriesEditor initialCategories={checkCategories} />
        </Panel>
      )}

      {isGestor && (
        <CollapsiblePanel
          title="Diagnóstico pós-onboarding"
          subtitle="temas de tarefa que se repetem nas clínicas novas — onde o processo de implantação está falhando"
        >
          <OnboardingDiagnostic />
        </CollapsiblePanel>
      )}
    </>
  )
}
