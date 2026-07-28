// Aba "IA" (só gestor) — instruções/modelo dos resumos, custo estimado e
// alertas de gasto OpenAI das clínicas.
import { redirect } from "next/navigation"
import { listClinics } from "@/lib/clinics/actions"
import { getCurrentProfile } from "@/lib/users/actions"
import { getAiUsageStats } from "@/lib/ai-usage/actions"
import { getAiSettings, getSuggestionStats } from "@/lib/ai-settings/actions"
import { getOpenAiAlertSettings, listOrphanKeySpend } from "@/lib/openai-usage/actions"
import { purposeLabel, formatBrl } from "@/lib/ai-usage/pricing"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel"
import { OpenAiAlertSettingsPanel } from "@/components/settings/openai-alert-settings-panel"
import { OrphanKeysPanel } from "@/components/settings/orphan-keys-panel"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesIaPage() {
  const currentProfile = await getCurrentProfile()
  if (currentProfile?.role !== "gestor") redirect("/configuracoes")

  const currentMonthUtc = new Date().toISOString().slice(0, 7)
  const [clinics, aiUsage, aiSettings, suggestionStats, openAiAlertSettings, orphanKeys] =
    await Promise.all([
      listClinics(),
      getAiUsageStats(),
      getAiSettings(),
      getSuggestionStats(),
      getOpenAiAlertSettings(),
      listOrphanKeySpend(),
    ])

  return (
    <>
      <Panel
        title="Custo de IA"
        subtitle={`estimativa do mês (${aiUsage.yearMonth}) — resumos diários, subtarefas via IA etc.`}
      >
        <div className="flex flex-wrap gap-3">
          <KpiCard
            label="Custo estimado"
            value={formatBrl(aiUsage.totalCostBrl)}
            hint={`${(aiUsage.totalPromptTokens + aiUsage.totalCompletionTokens).toLocaleString("pt-BR")} tokens`}
            accent="purple"
          />
          {aiUsage.byPurpose.map((p) => (
            <KpiCard
              key={p.purpose}
              label={purposeLabel(p.purpose)}
              value={formatBrl(p.costBrl)}
              hint={`${(p.promptTokens + p.completionTokens).toLocaleString("pt-BR")} tokens`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Estimativa com base no preço público da DeepSeek (input pior caso) e câmbio fixo — ajustar em{" "}
          <code>src/lib/ai-usage/pricing.ts</code> se os preços mudarem.
        </p>
      </Panel>

      <Panel
        title="IA — resumos e sugestões"
        subtitle="ajuste as instruções e o modelo, acompanhe a qualidade e teste sem gravar"
      >
        <AiSettingsPanel
          settings={aiSettings}
          stats={suggestionStats}
          clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
        />
      </Panel>

      <Panel
        title="Alertas e contenção de gasto — OpenAI"
        subtitle="limites do monitor por clínica (coleta diária via Admin API) e ação automática sobre conversas em loop"
      >
        <OpenAiAlertSettingsPanel settings={openAiAlertSettings} />
      </Panel>

      <Panel
        title="Gasto sem clínica vinculada"
        subtitle="chaves da organização que consumiram no mês e não pertencem a nenhuma clínica do painel"
      >
        <OrphanKeysPanel orphans={orphanKeys} yearMonth={currentMonthUtc} />
      </Panel>
    </>
  )
}
