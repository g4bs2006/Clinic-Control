import Link from "next/link"
import { notFound } from "next/navigation"
import { getClinic } from "@/lib/clinics/actions"
import { getClinicHistory } from "@/lib/portfolio/data"
import {
  getLiveFunnel,
  listClinicLeads,
  type ClinicLead,
} from "@/lib/clinics/integration-actions"
import { derivedMetrics } from "@/lib/portfolio/metrics"
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status"
import { createClient } from "@/lib/supabase/server"
import { monthKey } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { FunnelView } from "@/components/dashboard/funnel-view"
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart"

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

function leadDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
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

  const [history, rules, funnelRes, leadsRes] = await Promise.all([
    getClinicHistory(id, 6),
    loadStatusRules(),
    isAuto ? getLiveFunnel(id) : Promise.resolve(null),
    isAuto ? listClinicLeads(id) : Promise.resolve(null),
  ])

  const liveFunnel = funnelRes && funnelRes.ok ? funnelRes.funnel : null
  const leads: ClinicLead[] = leadsRes && leadsRes.ok ? leadsRes.leads : []

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

  // Trend chart: patch current month with live rate for auto clinics
  const series: TrendSeries[] = [{ key: clinic.name, color: CLINIC_COLOR }]
  const chartData = history.map((h) => {
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

      {/* ── Leads list (auto) ──────────────────────────────────── */}
      {isAuto && (
        <Panel
          title="Leads do mês"
          subtitle={`${leads.length} lead${leads.length !== 1 ? "s" : ""} · etapa atual`}
        >
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {leadsRes && !leadsRes.ok
                ? `Leads indisponíveis (${leadsRes.error}).`
                : "Nenhum lead neste mês."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Lead", "Etapa atual", "Entrada"].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.5rem 0.75rem",
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "oklch(0.64 0 0)",
                          textAlign: i === 2 ? "right" : "left",
                          borderBottom: "1px solid oklch(0.27 0.006 286)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr key={`${lead.name}-${i}`}>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          fontSize: "0.8rem",
                          color: "oklch(0.96 0 0)",
                          borderBottom: "1px solid oklch(0.235 0 0)",
                        }}
                      >
                        {lead.name || "—"}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          fontSize: "0.8rem",
                          color: "oklch(0.80 0 0)",
                          borderBottom: "1px solid oklch(0.235 0 0)",
                        }}
                      >
                        {lead.step}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          fontSize: "0.8rem",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "oklch(0.64 0 0)",
                          borderBottom: "1px solid oklch(0.235 0 0)",
                        }}
                      >
                        {leadDateLabel(lead.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </main>
  )
}
