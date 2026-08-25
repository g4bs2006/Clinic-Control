import { TarefasScopePage } from "@/components/tasks/tarefas-scope-page"

export const dynamic = "force-dynamic"

export default function TarefasClinicasPage() {
  return (
    <TarefasScopePage
      scope="clinicas"
      title="Tarefas das clínicas"
      subtitle="Tarefas das clínicas da carteira — cadastro, atendimento, cobranças e acompanhamento"
    />
  )
}
