// Aba "Visão geral" — o bater de olho diário: badges ao vivo (canais/status),
// KPIs do mês, funil, tendência, taxa por dia, tarefas e checklists.
import { notFound } from "next/navigation"
import { getClinic } from "@/lib/clinics/actions"
import { getClinicHistory } from "@/lib/portfolio/data"
import { getLiveFunnel, getHelenaAccountOverview, getDailyFunnelForMonth } from "@/lib/clinics/integration-actions"
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status"
import { createClient } from "@/lib/supabase/server"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { listClinicChecks } from "@/lib/clinics/check-items-actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ClinicFunnelExplorer } from "@/components/clinics/clinic-funnel-explorer"
import { ClinicOnboardingStatus } from "@/components/clinics/clinic-onboarding-status"
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart"
import { ClinicChecks } from "@/components/clinics/clinic-checks"
import { ClinicFunnelSetup } from "@/components/clinics/clinic-funnel-setup"
import { listClinicTasks, listTaskSuggestions } from "@/lib/tasks/actions"
import { listActiveTaskCategories } from "@/lib/tasks/category-actions"
import { TaskBoard } from "@/components/tasks/task-board"
import { DailyRateChart } from "@/components/clinics/daily-rate-chart"
import { fmtPct, fmtBRL, shortMonthLabel, monthLabel, lastNMonths } from "./shared"

export const dynamic = "force-dynamic"

const CLINIC_COLOR = "#7C3AED" // brand purple accent

async function loadStatusRules(): Promise<StatusRule[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("status_rules")
      .select("label, rate_min, rate_max, color")
      .order("position")
    return (data ?? []) as StatusRule[]
  } catch {
    return []
  }
}

export default async function ClinicOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const clinic = await getClinic(id)
  if (!clinic) notFound()

  const isAuto = clinic.mode === "auto"
  const currentMonth = monthKey(new Date())

  const [
    history, rules, funnelRes, helenaOverviewRes, dailyFunnelRes,
    clinicTasks, allTaskSuggestions, taskCategories, profiles, currentProfile, clinicChecks,
  ] = await Promise.all([
    getClinicHistory(id, 6),
    loadStatusRules(),
    isAuto ? getLiveFunnel(id) : Promise.resolve(null),
    isAuto ? getHelenaAccountOverview(id) : Promise.resolve(null),
    isAuto ? getDailyFunnelForMonth(id, currentMonth) : Promise.resolve(null),
    listClinicTasks(id),
    listTaskSuggestions(),
    listActiveTaskCategories(),
    listUserProfiles(),
    getCurrentProfile(),
    listClinicChecks(id),
  ])
  const clinicTaskSuggestions = allTaskSuggestions.filter((s) => s.clinic_id === id)

  // Gestor vê (leitura) o checklist do desenvolvedor responsável pela clínica.
  const responsibleDevId =
    currentProfile?.role === "gestor" &&
    clinic.developer_id &&
    clinic.developer_id !== currentProfile.id
      ? clinic.developer_id
      : null
  const devChecklist = responsibleDevId ? await listClinicChecks(id, responsibleDevId) : null
  const responsibleDevName = responsibleDevId
    ? profiles.find((p) => p.id === responsibleDevId)?.name ?? "desenvolvedor"
    : null

  const liveFunnel = funnelRes && funnelRes.ok ? funnelRes.funnel : null

  // Current-month figures: live funnel (auto) takes precedence over the snapshot
  const currentSnap = history.find((h) => h.month === currentMonth)
  const leadsCount = liveFunnel?.leads ?? currentSnap?.leads ?? 0
  const scheduledCount = liveFunnel?.scheduled ?? currentSnap?.scheduled ?? 0
  const rate = liveFunnel?.rate ?? currentSnap?.rate ?? 0
  const status = resolveStatus({ rate, rules })

  // Métricas derivadas (auto only) — todas vêm do funil ao vivo, que respeita o
  // mapeamento de colunas da clínica (fallback canônico por título quando não há).
  const derived = liveFunnel
    ? {
        attendance: liveFunnel.scheduled > 0 ? liveFunnel.attended / liveFunnel.scheduled : 0,
        closing: liveFunnel.attended > 0 ? liveFunnel.closed / liveFunnel.attended : 0,
        noShow: liveFunnel.scheduled > 0 ? liveFunnel.noShow / liveFunnel.scheduled : 0,
        notScheduled: liveFunnel.leads > 0 ? liveFunnel.notScheduled / liveFunnel.leads : 0,
      }
    : null

  // Trend chart: começa em maio/2026 (primeiro mês com dados); patch do mês
  // corrente com a taxa ao vivo nas clínicas auto.
  const series: TrendSeries[] = [{ key: clinic.name, color: CLINIC_COLOR }]
  const chartData = history
    .filter((h) => h.month >= DATA_START_MONTH)
    .map((h) => {
      const r = h.month === currentMonth && liveFunnel ? liveFunnel.rate : h.rate
      return {
        month: shortMonthLabel(h.month),
        [clinic.name]: Number((r * 100).toFixed(2)),
      }
    })

  const dailyMonthOptions = lastNMonths(currentMonth, 6, prevMonth)
    .filter((k) => k >= DATA_START_MONTH)
    .map((k) => ({ key: k, label: monthLabel(k) }))

  const channelBadges = isAuto && helenaOverviewRes?.ok ? helenaOverviewRes.channels ?? [] : []

  return (
    <>
      {/* ── Badges ao vivo (canais + status da taxa) ────────────── */}
      {(channelBadges.length > 0 || status) && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          {channelBadges.map((c) => {
            const isOnline = ["connected", "active", "online", "stable", "paired", "authenticated"].includes(c.status?.toLowerCase())
            return (
              <span
                key={c.id}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold flex items-center gap-1 ${
                  isOnline
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                }`}
              >
                <span className={`w-1 h-1 rounded-full ${isOnline ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
                {c.name || c.type || "Canal"}: {isOnline ? "Ativo" : "Inativo"}
              </span>
            )
          })}
          {status && (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: status.color, color: "#0f172a" }}
            >
              {status.label}
            </span>
          )}
        </div>
      )}

      {/* ── Auto clinic without live data: warning ─────────────── */}
      {isAuto && !liveFunnel && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Não foi possível ler o funil ao vivo da Helena agora
            {funnelRes && !funnelRes.ok ? ` (${funnelRes.error})` : ""}. Os números
            abaixo usam o último snapshot disponível.
          </p>
        </Panel>
      )}

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="Leads" value={leadsCount.toLocaleString("pt-BR")} accent="teal" />
        <KpiCard label="Agendados" value={scheduledCount.toLocaleString("pt-BR")} />
        <KpiCard label="Taxa" value={fmtPct(rate)} accent="purple" hint="agendados / leads" />
        {liveFunnel && (
          <KpiCard label="Faturamento" value={fmtBRL(liveFunnel.revenue)} accent="rose" />
        )}
        {isAuto && helenaOverviewRes?.ok && helenaOverviewRes.contactCount !== null && (
          <KpiCard
            label="Pacientes Helena"
            value={helenaOverviewRes.contactCount.toLocaleString("pt-BR")}
            accent="purple"
            hint="base ativa de contatos"
          />
        )}
        {derived && (
          <>
            <KpiCard label="Comparecimento" value={fmtPct(derived.attendance)} hint="compareceram / agendados" />
            <KpiCard label="Fechamento" value={fmtPct(derived.closing)} hint="fecharam / compareceram" />
            <KpiCard label="No-show" value={fmtPct(derived.noShow)} hint="faltas / agendados" />
            <KpiCard label="Não agendados" value={fmtPct(derived.notScheduled)} hint="não agendaram / leads" />
          </>
        )}
      </div>

      {/* ── Funnel + trend ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {liveFunnel ? (
          <Panel title="Funil de leads" subtitle="ao vivo da Helena · selecione o mês">
            <ClinicFunnelExplorer
              clinicId={id}
              monthOptions={dailyMonthOptions}
              initialMonth={currentMonth}
              initialFunnel={liveFunnel}
            />
          </Panel>
        ) : (
          <Panel
            title="Dados de Leads"
            subtitle="configure a integração automática ou insira os dados manuais"
          >
            <ClinicFunnelSetup
              clinicId={id}
              initialMode={clinic.mode}
              currentMonth={currentMonth}
              initialLeads={leadsCount}
              initialScheduled={scheduledCount}
              hasData={leadsCount > 0 || scheduledCount > 0}
            />
          </Panel>
        )}

        <Panel title="Tendência da taxa" subtitle="últimos 6 meses">
          <TrendChart data={chartData} series={series} xKey="month" />
        </Panel>
      </div>

      {/* ── Taxa de agendamento dia a dia ───────────────────────── */}
      {isAuto && dailyFunnelRes && (
        <Panel
          title="Taxa de agendamento por dia"
          subtitle="leads → agendados no CRM, agrupados por dia de criação do card"
        >
          {dailyFunnelRes.ok ? (
            <DailyRateChart
              clinicId={id}
              clinicName={clinic.name}
              monthOptions={dailyMonthOptions}
              initialMonth={currentMonth}
              initialDays={dailyFunnelRes.days}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{dailyFunnelRes.error}</p>
          )}
        </Panel>
      )}

      {/* ── Tarefas ─────────────────────────────────────────────── */}
      <Panel title="Tarefas" subtitle="pendências manuais e sugeridas pela IA para esta clínica">
        <TaskBoard
          tasks={clinicTasks}
          suggestions={clinicTaskSuggestions}
          clinics={[{ id: clinic.id, name: clinic.name, developerId: clinic.developer_id ?? null }]}
          profiles={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
          categories={taskCategories}
          currentUserId={currentProfile?.id ?? null}
          isGestor={currentProfile?.role === "gestor"}
          defaultClinicId={clinic.id}
        />
      </Panel>

      {/* ── Checklist (pessoal do usuário logado) ──────────────── */}
      <Panel
        title="Meu checklist"
        subtitle="seus itens para esta clínica · edite-os em Configurações"
      >
        <ClinicOnboardingStatus
          clinicId={id}
          onboardedAt={clinic.onboarded_at ?? null}
          createdAt={clinic.created_at}
        />
        {clinicChecks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não tem itens de checklist — crie os seus em Configurações.
          </p>
        ) : (
          <ClinicChecks clinicId={id} checks={clinicChecks} />
        )}
      </Panel>

      {/* ── Checklist do dev responsável (leitura, só p/ gestor) ── */}
      {devChecklist && devChecklist.length > 0 && (
        <Panel
          title={`Checklist de ${responsibleDevName}`}
          subtitle="somente leitura · progresso do desenvolvedor responsável"
        >
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {devChecklist.map((c) => (
              <li
                key={c.check_item_id}
                className="flex items-center gap-2 rounded-md border border-border/50 bg-accent/20 px-3 py-2 text-sm"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    c.checked
                      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-400"
                      : "border-border text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={c.checked ? "text-foreground" : "text-muted-foreground"}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {devChecklist.filter((c) => c.checked).length} de {devChecklist.length} concluídos
          </p>
        </Panel>
      )}
    </>
  )
}
