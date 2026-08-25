import { TarefasScopePage } from "@/components/tasks/tarefas-scope-page"

export const dynamic = "force-dynamic"

export default function TarefasInternasPage() {
  return (
    <TarefasScopePage
      scope="internas"
      title="Tarefas internas"
      subtitle="Trabalho da operação interna da Contact.IA — sem clínica vinculada"
    />
  )
}
