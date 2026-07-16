// Aba "Funil & Status" — faixas de status da carteira, etapas canônicas do
// funil e keywords do relatório de conversas.
import { listStatusRules, listFunnelSteps } from "@/lib/snapshots/rules-actions"
import { listReportKeywords } from "@/lib/reports/actions"
import { getCurrentProfile } from "@/lib/users/actions"
import { Panel } from "@/components/dashboard/panel"
import { CollapsiblePanel } from "@/components/dashboard/collapsible-panel"
import { StatusRulesEditor } from "@/components/settings/status-rules-editor"
import { ReportKeywordsEditor } from "@/components/settings/report-keywords-editor"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesFunilPage() {
  const [rules, steps, reportKeywords, currentProfile] = await Promise.all([
    listStatusRules(),
    listFunnelSteps(),
    listReportKeywords(),
    getCurrentProfile(),
  ])

  return (
    <>
      <Panel
        title="Faixas de status"
        subtitle="rótulo, intervalo de taxa e cor — usados em toda a carteira"
      >
        <StatusRulesEditor initialRules={rules} />
      </Panel>

      <Panel
        title="Etapas do funil"
        subtitle="as 9 etapas padrão do painel Controle de Leads"
      >
        <ol className="flex flex-col gap-1.5">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex items-center gap-3 rounded-md border border-border/60 bg-accent/20 px-3 py-2"
            >
              <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {String(step.position).padStart(2, "0")}
              </span>
              <span className="flex-1 text-sm text-foreground">{step.name}</span>
              {step.counts_as_scheduling && (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow-sm">
                  Agendamento
                </span>
              )}
              {step.counts_as_closing && (
                <span className="rounded-full bg-[oklch(0.74_0.15_165)]/15 px-2 py-0.5 text-[0.65rem] font-semibold text-[oklch(0.74_0.15_165)]">
                  Fechamento
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          As etapas são fixas nesta versão (espelham o funil padrão da Helena); painéis
          não-canônicos usam o mapeamento de colunas na página de cada clínica.
        </p>
      </Panel>

      <CollapsiblePanel
        title="Keywords do relatório de conversas"
        subtitle="termos que classificam cada estágio do funil E0-E8 na análise das conversas"
      >
        <ReportKeywordsEditor
          initialRows={reportKeywords}
          readOnly={currentProfile?.role !== "gestor"}
        />
      </CollapsiblePanel>
    </>
  )
}
