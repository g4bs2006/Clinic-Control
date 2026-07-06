import Link from "next/link"
import { notFound } from "next/navigation"
import { getClinic, listClinics } from "@/lib/clinics/actions"
import { getClinicHistory } from "@/lib/portfolio/data"
import { getLiveFunnel, getHelenaAccountOverview, getHelenaCustomFieldsAggregation, getHelenaTakeoverStats } from "@/lib/clinics/integration-actions"
import { derivedMetrics } from "@/lib/portfolio/metrics"
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status"
import { createClient } from "@/lib/supabase/server"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { listClinicAgents } from "@/lib/agents/actions"
import { listClinicFiles } from "@/lib/clinics/files-actions"
import { listClinicChecks } from "@/lib/clinics/check-items-actions"
import { listFormCredentials } from "@/lib/clinics/form-credentials-actions"
import { getClinicResponseStats, listClinicSummaries } from "@/lib/whatsapp/actions"
import { getClinicHelenaIntegration } from "@/lib/helena/accounts-actions"
import { ClinicHelenaIntegration } from "@/components/clinics/clinic-helena-integration"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { ClinicDeveloperSelect } from "@/components/clinics/clinic-developer-select"
import { listProvisioning } from "@/lib/clinics/provision-actions"
import { ClinicProvisioning } from "@/components/clinics/clinic-provisioning"
import { fmtDuration } from "@/lib/whatsapp/format"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { FunnelView } from "@/components/dashboard/funnel-view"
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart"
import { ClinicAgents } from "@/components/clinics/clinic-agents"
import { ClinicFiles } from "@/components/clinics/clinic-files"
import { ClinicChecks } from "@/components/clinics/clinic-checks"
import { ClinicSystemSelect } from "@/components/clinics/clinic-system-select"
import { ClinicFormCredentials } from "@/components/clinics/clinic-form-credentials"
import { ClinicFunnelSetup } from "@/components/clinics/clinic-funnel-setup"
import { listReportJobs } from "@/lib/reports/actions"
import { ReportPanel } from "@/components/reports/report-panel"
import { getDailyFunnelForMonth } from "@/lib/clinics/integration-actions"
import { listClinicTasks, listTaskSuggestions } from "@/lib/tasks/actions"
import { TaskBoard } from "@/components/tasks/task-board"
import { DailyRateChart } from "@/components/clinics/daily-rate-chart"

export const dynamic = "force-dynamic"

const CLINIC_COLOR = "#7C3AED" // brand purple accent

function fmtPct(rate: number): string {
  return (
    (rate * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%"
  )
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function shortMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
  return `${month.replace(".", "")}/${String(y).slice(2)}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function lastNMonths(current: string, n: number): string[] {
  const keys: string[] = []
  let key = current
  for (let i = 0; i < n; i++) {
    keys.unshift(key)
    key = prevMonth(key)
  }
  return keys
}

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

const CONTRACT_LABEL: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
}

export default async function ClinicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ resumo?: string }>
}) {
  const { id } = await params
  const { resumo } = await searchParams
  const clinic = await getClinic(id)
  if (!clinic) notFound()

  const isAuto = clinic.mode === "auto"
  const currentMonth = monthKey(new Date())

  // Fetch all clinics to determine previous/next clinic in order
  const [allClinics, history, rules, funnelRes, helenaOverviewRes, helenaCustomFieldsRes, takeoverRes, dailyFunnelRes] = await Promise.all([
    listClinics(),
    getClinicHistory(id, 6),
    loadStatusRules(),
    isAuto ? getLiveFunnel(id) : Promise.resolve(null),
    isAuto ? getHelenaAccountOverview(id) : Promise.resolve(null),
    isAuto ? getHelenaCustomFieldsAggregation(id, currentMonth) : Promise.resolve(null),
    isAuto ? getHelenaTakeoverStats(id, currentMonth) : Promise.resolve(null),
    isAuto ? getDailyFunnelForMonth(id, currentMonth) : Promise.resolve(null),
  ])

  const dailyMonthOptions = lastNMonths(currentMonth, 6)
    .filter((k) => k >= DATA_START_MONTH)
    .map((k) => ({ key: k, label: monthLabel(k) }))

  const currentIndex = allClinics.findIndex((c) => c.id === id)
  const prevClinic = currentIndex > 0 ? allClinics[currentIndex - 1] : null
  const nextClinic = currentIndex < allClinics.length - 1 ? allClinics[currentIndex + 1] : null

  const [agents, files, clinicChecks, formCredentials, responseStats, summaries, provisioning, helenaIntegration, profiles, currentProfile] =
    await Promise.all([
      listClinicAgents(id),
      listClinicFiles(id),
      listClinicChecks(id),
      listFormCredentials(id),
      getClinicResponseStats(id),
      listClinicSummaries(id),
      listProvisioning(id),
      getClinicHelenaIntegration(id),
      listUserProfiles(),
      getCurrentProfile(),
    ])

  const reportJobs = isAuto ? await listReportJobs(id) : []

  const [clinicTasks, allTaskSuggestions] = await Promise.all([
    listClinicTasks(id),
    listTaskSuggestions(),
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

  // Derived funnel metrics (auto only)
  const stepCounts: Record<string, number> = {}
  if (liveFunnel) {
    for (const s of liveFunnel.steps) stepCounts[s.title] = s.count
  }
  const derived = liveFunnel ? derivedMetrics(stepCounts) : null

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

  const cityUf = [clinic.city, clinic.state].filter(Boolean).join("/")

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            ← Carteira
          </Link>
          <div className="flex items-center gap-2">
            {prevClinic && (
              <Link
                href={`/clinicas/${prevClinic.id}`}
                title={prevClinic.name}
                className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2.5 py-1.2 text-[0.7rem] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                ← Anterior
              </Link>
            )}
            {nextClinic && (
              <Link
                href={`/clinicas/${nextClinic.id}`}
                title={nextClinic.name}
                className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2.5 py-1.2 text-[0.7rem] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold brand-header">{clinic.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cityUf || "Sem localização"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {isAuto ? "Automática" : "Manual"}
            </span>
            {isAuto && helenaOverviewRes?.ok && helenaOverviewRes.channels && (
              <>
                {helenaOverviewRes.channels.map((c) => {
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
              </>
            )}
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {CONTRACT_LABEL[clinic.contract_status] ?? clinic.contract_status}
            </span>
            {status && (
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: status.color, color: "#0f172a" }}
              >
                {status.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Provisionamento Helena ─────────────────────────────── */}
      {provisioning.length > 0 && (
        <Panel
          title="Provisionamento Helena"
          subtitle="conta, token, usuário, equipes e painel criados automaticamente"
        >
          <ClinicProvisioning clinicId={id} rows={provisioning} />
        </Panel>
      )}

      {/* ── Sistema utilizado + carteira ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Sistema" subtitle="prontuário / agenda utilizado pela clínica">
          <ClinicSystemSelect clinicId={id} current={clinic.system ?? null} />
        </Panel>
        <Panel title="Desenvolvedor responsável" subtitle="carteira: quem cuida desta clínica">
          <ClinicDeveloperSelect
            clinicId={id}
            current={clinic.developer_id ?? null}
            profiles={profiles}
          />
        </Panel>
      </div>

      {/* ── Tarefas ─────────────────────────────────────────────── */}
      <Panel title="Tarefas" subtitle="pendências manuais e sugeridas pela IA para esta clínica">
        <TaskBoard
          tasks={clinicTasks}
          suggestions={clinicTaskSuggestions}
          clinics={[{ id: clinic.id, name: clinic.name, developerId: clinic.developer_id ?? null }]}
          profiles={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
          defaultClinicId={clinic.id}
        />
      </Panel>

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

      {/* ── Relatório de conversas (análise IA) ────────────────── */}
      {isAuto && (
        <Panel
          title="Relatório de conversas"
          subtitle="análise das conversas da IA no período: funil E0-E8, agendamentos estimados por keyword e planilha para o cliente"
        >
          <ReportPanel clinicId={id} initialJobs={reportJobs} />
        </Panel>
      )}

      {/* ── Credenciais do Formulário ──────────────────────────── */}
      {(clinic.system === "Google Agenda" || clinic.system === "Clinicorp") && (
        <Panel
          title={clinic.system === "Google Agenda" ? "Agendas (Google Calendar)" : "Credenciais do Formulário (Clinicorp)"}
          subtitle={
            clinic.system === "Google Agenda"
              ? "identificadores das agendas de cada unidade"
              : "dados de integração de cada unidade · clique para copiar"
          }
        >
          <ClinicFormCredentials
            clinicId={id}
            credentials={formCredentials}
            system={clinic.system}
          />
        </Panel>
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
            <KpiCard label="No-show" value={fmtPct(derived.noShow)} hint="faltosos / agendados" />
          </>
        )}
      </div>

      {/* ── Funnel + trend ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {liveFunnel ? (
          <Panel title="Funil de leads" subtitle="mês corrente · ao vivo da Helena">
            <FunnelView steps={liveFunnel.steps} />
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

      {/* ── Atendimento: IA vs Humano (mês corrente) ───────────── */}
      {takeoverRes?.ok && takeoverRes.stats.total > 0 && (() => {
        const t = takeoverRes.stats
        const pctHuman = t.humanAssumed / t.total
        const pctBot = t.botOnly / t.total
        return (
          <Panel
            title="Atendimento · IA vs Humano"
            subtitle="conversas do mês corrente · humano = conversa com atendente designado"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard label="Conversas (mês)" value={t.total.toLocaleString("pt-BR")} accent="teal" />
              <KpiCard
                label="Assumidas por humano"
                value={fmtPct(pctHuman)}
                accent="rose"
                hint={`${t.humanAssumed.toLocaleString("pt-BR")} conversas`}
              />
              <KpiCard
                label="IA sem intervenção"
                value={fmtPct(pctBot)}
                accent="purple"
                hint={`${t.botOnly.toLocaleString("pt-BR")} conversas`}
              />
              <KpiCard
                label="Sem atendimento"
                value={t.untouched.toLocaleString("pt-BR")}
                hint="sem bot nem humano"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-red-400/80" style={{ width: `${pctHuman * 100}%` }} />
                <div className="h-full bg-brand" style={{ width: `${pctBot * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 text-[0.65rem] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-400/80" /> humano assumiu
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand" /> IA sozinha
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> sem atendimento
                </span>
              </div>
            </div>
          </Panel>
        )
      })()}

      {/* ── Tempo de resposta no grupo de WhatsApp ─────────────── */}
      {(() => {
        const current = responseStats.find((s) => s.year_month === currentMonth)
        const recent = responseStats
          .filter((s) => s.year_month >= DATA_START_MONTH)
          .slice(0, 6)
        if (recent.length === 0) return null
        return (
          <Panel
            title="Tempo de resposta · WhatsApp"
            subtitle="quanto a equipe demora para responder o cliente no grupo · bot ignorado"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Mediana (mês)"
                value={fmtDuration(current?.median_seconds)}
                accent="teal"
                hint="metade das conversas foi respondida mais rápido"
              />
              <KpiCard
                label="Média (mês)"
                value={fmtDuration(current?.avg_seconds)}
                hint="inflada por episódios fora do expediente"
              />
              <KpiCard
                label="Conversas (mês)"
                value={(current?.episodes ?? 0).toLocaleString("pt-BR")}
                accent="purple"
              />
              <KpiCard
                label="Sem resposta"
                value={(current?.unanswered ?? 0).toLocaleString("pt-BR")}
                accent="rose"
              />
            </div>
            <ul className="flex flex-col gap-1">
              {recent.map((s) => (
                <li
                  key={s.year_month}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent/60"
                >
                  <span className="text-muted-foreground">{shortMonthLabel(s.year_month)}</span>
                  <span className="flex items-center gap-4 tabular-nums">
                    <span className="text-foreground">
                      mediana <strong>{fmtDuration(s.median_seconds)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      {s.answered}/{s.episodes} respondidas
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )
      })()}

      {/* ── Custom Fields Aggregation (CRM Helena) ──────────────── */}
      {isAuto && helenaCustomFieldsRes?.ok && Object.keys(helenaCustomFieldsRes.counts).length > 0 && (
        <Panel 
          title="Atributos de Leads (Campos Personalizados)" 
          subtitle="informações extras preenchidas nos cards do CRM Helena"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(helenaCustomFieldsRes.counts).map(([fieldName, values]) => (
              <div key={fieldName} className="bg-accent/10 border border-border/40 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border/30 pb-2">
                  {fieldName}
                </h3>
                <ul className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {Object.entries(values)
                    .sort((a, b) => b[1] - a[1]) // highest count first
                    .map(([valName, count]) => (
                      <li key={valName} className="flex justify-between items-center text-sm">
                        <span className="text-foreground font-medium truncate max-w-[80%]" title={valName}>
                          {valName}
                        </span>
                        <span className="text-xs bg-brand-solid/10 text-brand-text border border-brand-border/40 rounded px-1.5 py-0.2 font-mono font-semibold">
                          {count}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── Integração Helena (conta, tokens, webhooks, eventos) ── */}
      {helenaIntegration.ok && helenaIntegration.account && (
        <ClinicHelenaIntegration
          account={helenaIntegration.account}
          events={helenaIntegration.events}
        />
      )}

      {/* ── Resumo diário do grupo (IA) ────────────────────────── */}
      {summaries.length > 0 && (() => {
        const selected =
          summaries.find((s) => s.summary_date === resumo) ?? summaries[0]
        const sentimentStyle: Record<string, { label: string; cls: string }> = {
          positivo: { label: "Positivo", cls: "bg-emerald-500/15 text-emerald-400" },
          neutro: { label: "Neutro", cls: "bg-zinc-500/15 text-zinc-400" },
          negativo: { label: "Negativo", cls: "bg-red-500/15 text-red-400" },
        }
        const sentiment = sentimentStyle[selected.highlights?.sentimento ?? "neutro"]
        const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

        // Faixa dos últimos 30 dias (fuso SP): uma bolinha por dia, colorida pelo sentimento
        const byDate = new Map(summaries.map((s) => [s.summary_date, s]))
        const todaySp = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
        const [ty, tm, td] = todaySp.split("-").map(Number)
        const stripDays: string[] = []
        for (let i = 29; i >= 0; i--) {
          stripDays.push(new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10))
        }
        const sentimentDot: Record<string, string> = {
          positivo: "bg-emerald-500",
          neutro: "bg-zinc-500",
          negativo: "bg-red-500",
        }

        const fullDayLabel = (() => {
          const [y, m, d] = selected.summary_date.split("-").map(Number)
          return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            timeZone: "UTC",
          })
        })()
        return (
          <Panel
            title="Resumo diário · WhatsApp"
            subtitle="o que aconteceu no grupo, resumido por IA · clique num dia da faixa"
          >
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {stripDays.map((d) => {
                  const s = byDate.get(d)
                  const isSelected = s && d === selected.summary_date
                  const senti = s?.highlights?.sentimento ?? "neutro"
                  const churn = s?.highlights?.risco_churn === true
                  const title = s
                    ? `${dayLabel(d)} · ${senti}${churn ? " · risco churn" : ""}`
                    : `${dayLabel(d)} · sem resumo`
                  const dot = (
                    <span
                      className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                        s ? sentimentDot[senti] : "border border-border/70 bg-transparent"
                      } ${
                        isSelected
                          ? "ring-2 ring-primary scale-110"
                          : churn
                            ? "ring-2 ring-red-500/50"
                            : ""
                      }`}
                    />
                  )
                  return s ? (
                    <Link
                      key={d}
                      href={`/clinicas/${id}?resumo=${d}`}
                      scroll={false}
                      title={title}
                      className="p-0.5 transition-transform hover:scale-110"
                    >
                      {dot}
                    </Link>
                  ) : (
                    <span key={d} title={title} className="p-0.5">
                      {dot}
                    </span>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[0.62rem] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> positivo
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-zinc-500" /> neutro
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> negativo
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500 ring-2 ring-red-500/50" /> risco churn
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full border border-border/70" /> sem resumo
                </span>
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-accent/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold capitalize text-foreground">
                  {fullDayLabel}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {selected.highlights?.risco_churn && (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-red-400">
                      Risco churn
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${sentiment.cls}`}>
                    {sentiment.label}
                  </span>
                </span>
              </div>

              <div className="md-prose text-sm text-muted-foreground [&_p]:my-1.5 [&_ul]:my-1.5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.summary_md}</ReactMarkdown>
              </div>

              {(selected.highlights?.temas?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.highlights!.temas!.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[oklch(0.62_0.17_255)]/12 px-2 py-0.5 text-[0.65rem] font-medium text-[oklch(0.70_0.16_255)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {(selected.highlights?.pendencias?.length ?? 0) > 0 && (
                <div className="text-xs">
                  <span className="font-semibold text-amber-400/90">Pendências: </span>
                  <span className="text-muted-foreground">
                    {selected.highlights!.pendencias!.join(" · ")}
                  </span>
                </div>
              )}
              {(selected.highlights?.reclamacoes?.length ?? 0) > 0 && (
                <div className="text-xs">
                  <span className="font-semibold text-red-400/90">Reclamações: </span>
                  <span className="text-muted-foreground">
                    {selected.highlights!.reclamacoes!.join(" · ")}
                  </span>
                </div>
              )}
              <div className="text-[0.62rem] text-muted-foreground/60 tabular-nums">
                {selected.message_count} mensagens analisadas · {selected.model ?? "—"}
              </div>
            </div>
          </Panel>
        )
      })()}

      {/* ── Checklist (pessoal do usuário logado) ──────────────── */}
      <Panel
        title="Meu checklist"
        subtitle="seus itens para esta clínica · edite-os em Configurações"
      >
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

      {/* ── Agentes de IA ──────────────────────────────────────── */}
      <Panel
        title="Agentes de IA"
        subtitle="persona e estágios · editáveis (importados da pasta da clínica)"
      >
        <ClinicAgents agents={agents} />
      </Panel>

      {/* ── Arquivos da clínica ────────────────────────────────── */}
      <Panel
        title="Arquivos da clínica"
        subtitle="suba a pasta · qualquer pessoa da equipe pode baixar"
      >
        <ClinicFiles clinicId={id} files={files} />
      </Panel>
    </main>
  )
}
