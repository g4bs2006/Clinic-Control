import { listStatusRules, listFunnelSteps } from "@/lib/snapshots/rules-actions"
import { Panel } from "@/components/dashboard/panel"
import { StatusRulesEditor } from "@/components/settings/status-rules-editor"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesPage() {
  const [rules, steps] = await Promise.all([listStatusRules(), listFunnelSteps()])

  return (
    <main className="p-6 space-y-6 max-w-screen-lg mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Faixas de status e definição do funil
        </p>
      </div>

      {/* ── Status rules ───────────────────────────────────────── */}
      <Panel
        title="Faixas de status"
        subtitle="rótulo, intervalo de taxa e cor — usados em toda a carteira"
      >
        <StatusRulesEditor initialRules={rules} />
      </Panel>

      {/* ── Funnel steps (read-only) ───────────────────────────── */}
      <Panel
        title="Etapas do funil"
        subtitle="as 9 etapas padrão do painel Controle de Leads"
      >
        <ol className="flex flex-col gap-1.5">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex items-center gap-3 rounded-md border border-border/60 bg-[oklch(0.24_0.03_238)] px-3 py-2"
            >
              <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {String(step.position).padStart(2, "0")}
              </span>
              <span className="flex-1 text-sm text-foreground">{step.name}</span>
              {step.counts_as_scheduling && (
                <span className="rounded-full bg-[oklch(0.62_0.20_292)]/15 px-2 py-0.5 text-[0.65rem] font-semibold text-[oklch(0.68_0.18_292)]">
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
          As etapas são fixas nesta versão (espelham o funil padrão da Helena).
        </p>
      </Panel>
    </main>
  )
}
