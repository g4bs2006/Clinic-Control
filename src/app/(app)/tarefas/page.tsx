import { TarefasScopePage } from "@/components/tasks/tarefas-scope-page"

export const dynamic = "force-dynamic"

export default function TarefasPage() {
  return (
    <TarefasScopePage
      scope="all"
      title="Tarefas"
      subtitle="Pendências da carteira — manuais ou sugeridas pelos resumos diários da IA"
    />
  )
}
