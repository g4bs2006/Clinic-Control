// Aba "Automação" — estado da automação de agendamento em toda a carteira.
// Substitui a leitura manual da coluna `status_obs` da tabela do n8n: aqui dá
// para ver quem está pronto, quem está incompleto e onde as duas bases divergem.
import { listAutomationOverview } from "@/lib/clinics/automation-actions"
import { Panel } from "@/components/dashboard/panel"
import { AutomationOverview } from "@/components/settings/automation-overview"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesAutomacaoPage() {
  const res = await listAutomationOverview()

  if (!res.ok) {
    return (
      <Panel title="Automação de agendamento">
        <p className="text-sm text-muted-foreground">{res.error}</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Automação de agendamento"
      subtitle="o que o n8n usa para agendar em cada clínica · o Clinic Control é a fonte da verdade e espelha para a tabela que os workflows leem"
    >
      <AutomationOverview initialItems={res.items} orphans={res.orphans} />
    </Panel>
  )
}
