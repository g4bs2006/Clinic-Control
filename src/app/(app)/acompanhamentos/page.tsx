import { listAcompanhamentos } from "@/lib/acompanhamentos/actions"
import { listTaskSuggestions } from "@/lib/tasks/actions"
import { Panel } from "@/components/dashboard/panel"
import { AcompanhamentosList } from "@/components/acompanhamentos/acompanhamentos-list"
import { AcompanhamentoSuggestions } from "@/components/acompanhamentos/acompanhamento-suggestions"

export const dynamic = "force-dynamic"

export default async function AcompanhamentosPage() {
  const [items, allSuggestions] = await Promise.all([
    listAcompanhamentos(),
    listTaskSuggestions(),
  ])
  const suggestions = allSuggestions.filter((s) => s.kind === "acompanhamento")

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold brand-header">Acompanhamentos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Itens de &ldquo;ficar de olho&rdquo; da carteira — follow-ups sugeridos pela IA ou criados por você
        </p>
      </div>

      {suggestions.length > 0 && <AcompanhamentoSuggestions suggestions={suggestions} />}

      <Panel>
        <AcompanhamentosList initialItems={items} />
      </Panel>
    </main>
  )
}
