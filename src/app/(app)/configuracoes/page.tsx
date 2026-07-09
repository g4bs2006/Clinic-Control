import { listStatusRules, listFunnelSteps } from "@/lib/snapshots/rules-actions"
import { listManagedCheckItems } from "@/lib/clinics/check-items-actions"
import { listCheckCategories } from "@/lib/clinics/check-categories-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listWhatsappGroups, listTeamMembers } from "@/lib/whatsapp/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { listReportKeywords } from "@/lib/reports/actions"
import { listTaskCategories } from "@/lib/tasks/category-actions"
import { getAiUsageStats } from "@/lib/ai-usage/actions"
import { getAiSettings, getSuggestionStats } from "@/lib/ai-settings/actions"
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel"
import { purposeLabel, formatBrl } from "@/lib/ai-usage/pricing"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ReportKeywordsEditor } from "@/components/settings/report-keywords-editor"
import { Panel } from "@/components/dashboard/panel"
import { CollapsiblePanel } from "@/components/dashboard/collapsible-panel"
import { StatusRulesEditor } from "@/components/settings/status-rules-editor"
import { TaskCategoriesEditor } from "@/components/settings/task-categories-editor"
import { CheckItemsEditor } from "@/components/settings/check-items-editor"
import { CheckCategoriesEditor } from "@/components/settings/check-categories-editor"
import { WhatsappGroupsEditor } from "@/components/settings/whatsapp-groups-editor"
import { WhatsappTeamEditor } from "@/components/settings/whatsapp-team-editor"
import { UsersEditor } from "@/components/settings/users-editor"
import { ChangePasswordForm } from "@/components/settings/change-password-form"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesPage() {
  const [rules, steps, checkItems, checkCategories, clinics, groups, teamMembers, profiles, reportKeywords, currentProfile, taskCategories, aiUsage, aiSettings, suggestionStats] = await Promise.all([
    listStatusRules(),
    listFunnelSteps(),
    listManagedCheckItems(),
    listCheckCategories(),
    listClinics(),
    listWhatsappGroups(),
    listTeamMembers(),
    listUserProfiles(),
    listReportKeywords(),
    getCurrentProfile(),
    listTaskCategories(),
    getAiUsageStats(),
    getAiSettings(),
    getSuggestionStats(),
  ])

  const clinicCountByDeveloper: Record<string, number> = {}
  for (const c of clinics) {
    if (c.developer_id) {
      clinicCountByDeveloper[c.developer_id] = (clinicCountByDeveloper[c.developer_id] ?? 0) + 1
    }
  }

  return (
    <main className="p-6 space-y-6 max-w-screen-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold brand-header">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Faixas de status, definição do funil e checklist de clínicas
        </p>
      </div>

      {/* ── Usuários e papéis ──────────────────────────────────── */}
      <Panel
        title="Usuários"
        subtitle="gestor vê toda a carteira · desenvolvedor vê só as clínicas dele"
      >
        <UsersEditor
          initialProfiles={profiles}
          clinicCountByDeveloper={clinicCountByDeveloper}
        />
      </Panel>

      {/* ── Minha conta ────────────────────────────────────────── */}
      <Panel title="Minha conta" subtitle="trocar a própria senha de acesso">
        <ChangePasswordForm />
      </Panel>

      {/* ── Custo de IA ─────────────────────────────────────────── */}
      {currentProfile?.role === "gestor" && (
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
      )}

      {/* ── IA: instruções, qualidade e teste ──────────────────── */}
      {currentProfile?.role === "gestor" && (
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
      )}

      {/* ── Categorias de tarefa ───────────────────────────────── */}
      <Panel
        title="Categorias de tarefa"
        subtitle="usadas em /tarefas e no painel de tarefas de cada clínica"
      >
        <TaskCategoriesEditor initialCategories={taskCategories} />
      </Panel>

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
          As etapas são fixas nesta versão (espelham o funil padrão da Helena).
        </p>
      </Panel>

      {/* ── Keywords do relatório de conversas (recolhível, fechado) ── */}
      <CollapsiblePanel
        title="Keywords do relatório de conversas"
        subtitle="termos que classificam cada estágio do funil E0-E8 na análise das conversas"
      >
        <ReportKeywordsEditor
          initialRows={reportKeywords}
          readOnly={currentProfile?.role !== "gestor"}
        />
      </CollapsiblePanel>

      {/* ── Checklist de clínicas ──────────────────────────────── */}
      <Panel
        title="Meu checklist de clínicas"
        subtitle={
          currentProfile?.role === "gestor"
            ? "seus itens pessoais + todos os fixos (compartilhados entre gestores) — marque “Fixo” para valer em todas as clínicas, para todos"
            : "itens pessoais — cada usuário tem os seus; aparecem em todas as clínicas só para você"
        }
      >
        <CheckItemsEditor
          initialItems={checkItems}
          categories={checkCategories}
          canMakeGlobal={currentProfile?.role === "gestor"}
        />
      </Panel>

      {/* ── Categorias do checklist (gestor) ───────────────────── */}
      {currentProfile?.role === "gestor" && (
        <Panel
          title="Categorias do checklist"
          subtitle="organizam os itens por etapa (ex.: Painéis, n8n, Agente de IA, Chatbot)"
        >
          <CheckCategoriesEditor initialCategories={checkCategories} />
        </Panel>
      )}

      {/* ── WhatsApp: grupos → clínicas ────────────────────────── */}
      <Panel
        title="Grupos de WhatsApp"
        subtitle="mapeie cada grupo coletado à clínica dona — base do tempo de resposta"
      >
        <WhatsappGroupsEditor
          groups={groups}
          clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
        />
      </Panel>

      {/* ── WhatsApp: equipe / bot ─────────────────────────────── */}
      <Panel
        title="Equipe no WhatsApp"
        subtitle="quem conta como resposta humana nos grupos (e quais IDs são bot)"
      >
        <WhatsappTeamEditor initialMembers={teamMembers} />
      </Panel>
    </main>
  )
}
