import { listStatusRules, listFunnelSteps } from "@/lib/snapshots/rules-actions"
import { listCheckItems } from "@/lib/clinics/check-items-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listWhatsappGroups, listTeamMembers } from "@/lib/whatsapp/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { listInvites } from "@/lib/users/invites-actions"
import { listReportKeywords } from "@/lib/reports/actions"
import { listTaskCategories } from "@/lib/tasks/category-actions"
import { ReportKeywordsEditor } from "@/components/settings/report-keywords-editor"
import { InvitesEditor } from "@/components/settings/invites-editor"
import { Panel } from "@/components/dashboard/panel"
import { StatusRulesEditor } from "@/components/settings/status-rules-editor"
import { TaskCategoriesEditor } from "@/components/settings/task-categories-editor"
import { CheckItemsEditor } from "@/components/settings/check-items-editor"
import { WhatsappGroupsEditor } from "@/components/settings/whatsapp-groups-editor"
import { WhatsappTeamEditor } from "@/components/settings/whatsapp-team-editor"
import { UsersEditor } from "@/components/settings/users-editor"
import { ChangePasswordForm } from "@/components/settings/change-password-form"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesPage() {
  const [rules, steps, checkItems, clinics, groups, teamMembers, profiles, invites, reportKeywords, currentProfile, taskCategories] = await Promise.all([
    listStatusRules(),
    listFunnelSteps(),
    listCheckItems(),
    listClinics(),
    listWhatsappGroups(),
    listTeamMembers(),
    listUserProfiles(),
    listInvites(),
    listReportKeywords(),
    getCurrentProfile(),
    listTaskCategories(),
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
        <InvitesEditor initialInvites={invites} />
      </Panel>

      {/* ── Minha conta ────────────────────────────────────────── */}
      <Panel title="Minha conta" subtitle="trocar a própria senha de acesso">
        <ChangePasswordForm />
      </Panel>

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

      {/* ── Keywords do relatório de conversas ─────────────────── */}
      <Panel
        title="Keywords do relatório de conversas"
        subtitle="termos que classificam cada estágio do funil E0-E8 na análise das conversas"
      >
        <ReportKeywordsEditor
          initialRows={reportKeywords}
          readOnly={currentProfile?.role !== "gestor"}
        />
      </Panel>

      {/* ── Checklist items (pessoais do usuário logado) ───────── */}
      <Panel
        title="Meu checklist de clínicas"
        subtitle="itens pessoais — cada usuário tem os seus; aparecem em todas as clínicas só para você"
      >
        <CheckItemsEditor initialItems={checkItems} />
      </Panel>

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
