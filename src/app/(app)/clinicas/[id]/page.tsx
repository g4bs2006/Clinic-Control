import Link from "next/link"
import { notFound } from "next/navigation"
import { getClinic } from "@/lib/clinics/actions"
import { getClinicHistory } from "@/lib/portfolio/data"
import { getLiveFunnel } from "@/lib/clinics/integration-actions"
import { derivedMetrics } from "@/lib/portfolio/metrics"
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status"
import { createClient } from "@/lib/supabase/server"
import { monthKey, DATA_START_MONTH } from "@/lib/snapshots/month"
import { listClinicAgents } from "@/lib/agents/actions"
import { listClinicFiles } from "@/lib/clinics/files-actions"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { FunnelView } from "@/components/dashboard/funnel-view"
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart"
import { ClinicAgents } from "@/components/clinics/clinic-agents"
import { ClinicFiles } from "@/components/clinics/clinic-files"

export const dynamic = "force-dynamic"

const CLINIC_COLOR = "#60a5fa" // blue accent

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
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const clinic = await getClinic(id)
  if (!clinic) notFound()

  const isAuto = clinic.mode === "auto"
  const currentMonth = monthKey(new Date())

  const [history, rules, funnelRes] = await Promise.all([
    getClinicHistory(id, 6),
    loadStatusRules(),
    isAuto ? getLiveFunnel(id) : Promise.resolve(null),
  ])

  const [agents, files] = await Promise.all([
    listClinicAgents(id),
    listClinicFiles(id),
  ])

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
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          ← Carteira
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{clinic.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cityUf || "Sem localização"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {isAuto ? "Automática" : "Manual"}
            </span>
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
          <Panel title="Funil de leads" subtitle="indisponível">
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <span className="text-2xl opacity-40">—</span>
              <span className="text-sm">
                {isAuto
                  ? "Funil ao vivo indisponível"
                  : "Funil completo só para clínicas automáticas"}
              </span>
              {!isAuto && (
                <Link href="/mensal" className="text-xs text-[oklch(0.62_0.17_255)] hover:underline">
                  Editar dados na grade mensal →
                </Link>
              )}
            </div>
          </Panel>
        )}

        <Panel title="Tendência da taxa" subtitle="últimos 6 meses">
          <TrendChart data={chartData} series={series} />
        </Panel>
      </div>

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
