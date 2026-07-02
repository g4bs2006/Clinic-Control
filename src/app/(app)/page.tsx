import Link from "next/link"
import { getPortfolioForMonth } from "@/lib/portfolio/data"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Panel } from "@/components/dashboard/panel"
import { StatusDonut } from "@/components/dashboard/status-donut"
import { RankingTable } from "@/components/dashboard/ranking-table"
import { PortfolioFilters } from "@/components/dashboard/portfolio-filters"
import { listCheckItems, listAllClinicChecks } from "@/lib/clinics/check-items-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listResponseStats } from "@/lib/whatsapp/actions"
import { fmtDuration } from "@/lib/whatsapp/format"
import { ExportButton } from "@/components/dashboard/export-button"
import { CheckCircle2 } from "lucide-react"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ month?: string; region?: string }>

// Build a pt-BR month label from a YYYY-MM key
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

// Build the last N month keys (oldest → newest), including current
function lastNMonths(current: string, n: number): string[] {
  const keys: string[] = []
  let key = current
  for (let i = 0; i < n; i++) {
    keys.unshift(key)
    key = prevMonth(key)
  }
  return keys
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const now = new Date()
  const currentMonth = monthKey(now)

  // Validate month param (same pattern as /mensal)
  const rawMonth = params.month ?? ""
  const month: string = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth

  // Region filter (raw string; will be validated against distinct regions from rows)
  const rawRegion = params.region ?? ""

  // Fetch portfolio data, check items, all checks, raw clinics and WhatsApp stats
  const [portfolioData, checkItems, allChecksMap, rawClinics, responseStats] = await Promise.all([
    getPortfolioForMonth(month),
    listCheckItems(),
    listAllClinicChecks(),
    listClinics(),
    listResponseStats(month),
  ])
  const { rows: allRows, summary } = portfolioData

  // Convert Map<string, Map<string, boolean>> to Record<string, Record<string, boolean>>
  const allChecks: Record<string, Record<string, boolean>> = {}
  for (const [clinicId, checksMap] of allChecksMap) {
    allChecks[clinicId] = Object.fromEntries(checksMap)
  }

  // Derive distinct, sorted regions from all rows (non-null only)
  const regions = Array.from(
    new Set(allRows.map((r) => r.region).filter((r): r is string => !!r))
  ).sort()

  // Validate region param against actual regions
  const region = regions.includes(rawRegion) ? rawRegion : ""

  // Apply region filter to rows for ranking table (summary uses all rows)
  const filteredRows = region ? allRows.filter((r) => r.region === region) : allRows

  // Performance por região (sobre todas as linhas com dados)
  const regionAgg = new Map<string, { sum: number; count: number; leads: number }>()
  for (const r of allRows) {
    if (r.source === "none") continue
    const key = r.region ?? "Sem região"
    const agg = regionAgg.get(key) ?? { sum: 0, count: 0, leads: 0 }
    agg.sum += r.rate
    agg.count += 1
    agg.leads += r.leads
    regionAgg.set(key, agg)
  }
  const regionPerformance = Array.from(regionAgg.entries())
    .map(([name, { sum, count, leads }]) => ({ name, avgRate: sum / count, count, leads }))
    .sort((a, b) => b.avgRate - a.avgRate)
  const maxRegionRate = Math.max(0.0001, ...regionPerformance.map((r) => r.avgRate))

  // Month selector options — desde maio/2026 (primeiro mês com dados) até o atual
  const monthOptions = lastNMonths(currentMonth, 12)
    .filter((k) => k >= DATA_START_MONTH)
    .map((k) => ({
      key: k,
      label: monthLabel(k),
    }))

  // KPI formatting helpers (pt-BR)
  const fmtNumber = (n: number) => n.toLocaleString("pt-BR")
  const fmtRate = (r: number) =>
    (r * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"

  const displayMonthLabel = monthLabel(month)

  // ── Calculate Onboarding Checklist Metrics ─────────────────
  const totalClinics = allRows.length
  const totalCheckItemsCount = checkItems.length
  let clinicsOnboarded = 0
  let totalCheckedChecks = 0
  const clinicPendingCounts: { name: string; pending: number; id: string }[] = []

  for (const row of allRows) {
    const checks = allChecks[row.clinicId] ?? {}
    const checkedCount = checkItems.filter((ci) => checks[ci.id] === true).length
    totalCheckedChecks += checkedCount
    const pending = totalCheckItemsCount - checkedCount
    if (pending === 0 && totalCheckItemsCount > 0) {
      clinicsOnboarded++
    }
    if (pending > 0) {
      clinicPendingCounts.push({ name: row.name, pending, id: row.clinicId })
    }
  }

  const topPendingClinics = clinicPendingCounts
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 5)

  const overallOnboardingProgress = totalClinics * totalCheckItemsCount > 0
    ? (totalCheckedChecks / (totalClinics * totalCheckItemsCount)) * 100
    : 0

  // ── Calculate Churn Risk Alerts (Bottom 4 active clinics by scheduling rate) ──
  const riskRows = allRows
    .filter((r) => r.source !== "none") // only active clinics with data in this period
    .map((r) => {
      const checks = allChecks[r.clinicId] ?? {}
      const checkedCount = checkItems.filter((ci) => checks[ci.id] === true).length
      return {
        ...r,
        checkedCount,
        totalChecks: totalCheckItemsCount,
      }
    })
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 4)

  // ── WhatsApp response time (per-clinic medians for the month) ──
  const nameByClinicId = new Map(allRows.map((r) => [r.clinicId, r.name]))
  const responseRows = responseStats
    .filter((s) => s.median_seconds != null && nameByClinicId.has(s.clinic_id))
    .map((s) => ({
      clinicId: s.clinic_id,
      name: nameByClinicId.get(s.clinic_id)!,
      medianSeconds: s.median_seconds!,
      episodes: s.episodes,
      unanswered: s.unanswered,
    }))
    .sort((a, b) => b.medianSeconds - a.medianSeconds)
  const medianValues = responseRows.map((r) => r.medianSeconds).sort((a, b) => a - b)
  const portfolioMedian =
    medianValues.length > 0 ? medianValues[Math.floor(medianValues.length / 2)] : null
  const totalUnanswered = responseRows.reduce((sum, r) => sum + r.unanswered, 0)
  const slowestClinics = responseRows.slice(0, 4)

  // ── Prepare CSV Export Data ─────────────────────────────────
  const exportData = filteredRows.map((row) => {
    const checks = allChecks[row.clinicId] ?? {}
    const checkedCount = checkItems.filter((ci) => checks[ci.id] === true).length
    const rawClinic = rawClinics.find((c) => c.id === row.clinicId)
    const contractStatus = rawClinic
      ? rawClinic.contract_status === "active"
        ? "Ativo"
        : rawClinic.contract_status === "suspended"
        ? "Suspenso"
        : "Arquivado"
      : "—"

    return {
      name: row.name,
      location: [row.city, row.state].filter(Boolean).join("/") || "—",
      region: row.region ?? "—",
      mode: row.mode === "auto" ? "Automática" : "Manual",
      contractStatus,
      leads: row.leads,
      scheduled: row.scheduled,
      rate: fmtRate(row.rate),
      status: row.status ?? "—",
      revenue: row.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      checklist: `${checkedCount}/${totalCheckItemsCount}`,
    }
  })

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold capitalize brand-header">
            Carteira
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {displayMonthLabel} · {summary.clinicCount} clínica
            {summary.clinicCount !== 1 ? "s" : ""}
            {region && (
              <span className="ml-1 text-primary">· {region}</span>
            )}
          </p>
        </div>

        {/* Action buttons and Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton data={exportData} filename={`relatorio-performance-${month}`} />
          <PortfolioFilters
            month={month}
            region={region}
            regions={regions}
            monthOptions={monthOptions}
          />
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Clínicas"
          value={fmtNumber(summary.clinicCount)}
          accent="teal"
        />
        <KpiCard
          label="Taxa média"
          value={fmtRate(summary.avgRate)}
          accent="purple"
          hint="agendados / leads"
        />
        <KpiCard
          label="Leads"
          value={fmtNumber(summary.totalLeads)}
        />
        <KpiCard
          label="Agendados"
          value={fmtNumber(summary.totalScheduled)}
          accent="rose"
        />
      </div>

      {/* ── Main grid: donut + ranking ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">

        {/* Status Donut + Onboarding + Churn + Performance por região */}
        <div className="flex flex-col gap-4">
          <Panel title="Status da carteira" subtitle="distribuição por faixa">
            <StatusDonut
              data={summary.statusDistribution}
              totalClinics={summary.clinicCount}
            />
          </Panel>

          {/* ── Onboarding / Implementation Status ───────────────── */}
          <Panel title="Status de implantação" subtitle="progresso geral do onboarding">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progresso da carteira</span>
                  <span className="font-semibold text-foreground tabular-nums">{overallOnboardingProgress.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-300"
                    style={{ width: `${overallOnboardingProgress}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                <span className="text-muted-foreground">Clínicas prontas (100%):</span>
                <span className="font-semibold text-foreground tabular-nums">{clinicsOnboarded} / {totalClinics}</span>
              </div>
              {topPendingClinics.length > 0 && (
                <div className="border-t border-border/40 pt-3">
                  <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Maiores pendências
                  </div>
                  <ul className="space-y-1.5">
                    {topPendingClinics.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-xs">
                        <Link href={`/clinicas/${p.id}`} className="text-brand-gradient hover:opacity-85 font-medium transition-opacity truncate max-w-[170px]">
                          {p.name}
                        </Link>
                        <span className="text-[0.68rem] text-muted-foreground tabular-nums shrink-0">
                          {p.pending} {p.pending === 1 ? "pendência" : "pendências"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Panel>

          {/* ── Churn Risk Alerts ────────────────────────────────── */}
          <Panel title="Alertas de risco" subtitle="as 4 menores taxas de agendamento">
            {riskRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-500/80 mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma clínica ativa no período.</p>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {riskRows.map((r) => (
                  <li
                    key={r.clinicId}
                    className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-accent/30 p-2.5 hover:bg-accent/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/clinicas/${r.clinicId}`} className="text-xs font-semibold text-foreground hover:underline truncate">
                        {r.name}
                      </Link>
                      <span
                        className="rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide shrink-0"
                        style={{
                          color: "#0f172a",
                          background: r.statusColor ?? "#f97316",
                        }}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
                      <span>
                        Taxa: <strong className="text-foreground tabular-nums">{fmtRate(r.rate)}</strong>
                      </span>
                      <span className="tabular-nums">
                        Checklist: {r.checkedCount}/{r.totalChecks}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ── WhatsApp response time ───────────────────────────── */}
          <Panel title="Tempo de resposta · WhatsApp" subtitle="mediana por clínica no mês">
            {responseRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem conversas no período.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Mediana da carteira</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {fmtDuration(portfolioMedian)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                  <span className="text-muted-foreground">Conversas sem resposta:</span>
                  <span className="font-semibold text-foreground tabular-nums">{totalUnanswered}</span>
                </div>
                <div className="border-t border-border/40 pt-3">
                  <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Respostas mais lentas
                  </div>
                  <ul className="space-y-1.5">
                    {slowestClinics.map((r) => (
                      <li key={r.clinicId} className="flex items-center justify-between text-xs">
                        <Link
                          href={`/clinicas/${r.clinicId}`}
                          className="text-brand-gradient hover:opacity-85 font-medium transition-opacity truncate max-w-[170px]"
                        >
                          {r.name}
                        </Link>
                        <span className="text-[0.68rem] text-muted-foreground tabular-nums shrink-0">
                          {fmtDuration(r.medianSeconds)} · {r.episodes} conv.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Performance por região" subtitle="taxa média · clique para filtrar">
            {regionPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {regionPerformance.map((r, i) => {
                  const isReal = r.name !== "Sem região"
                  const isActive = region === r.name
                  const rank =
                    regionPerformance.length > 1
                      ? i === 0
                        ? "melhor"
                        : i === regionPerformance.length - 1
                          ? "pior"
                          : null
                      : null
                  const body = (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm text-foreground">
                          {r.name}
                          {rank && (
                            <span
                              className="rounded px-1 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
                              style={{
                                color: rank === "melhor" ? "oklch(0.74 0.16 152)" : "oklch(0.65 0.20 25)",
                                background:
                                  rank === "melhor"
                                    ? "oklch(0.74 0.16 152 / 0.12)"
                                    : "oklch(0.65 0.20 25 / 0.12)",
                              }}
                            >
                              {rank}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold tabular-nums text-brand-gradient">
                          {fmtRate(r.avgRate)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${(r.avgRate / maxRegionRate) * 100}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">
                          {r.count} clín. · {fmtNumber(r.leads)} leads
                        </span>
                      </div>
                    </>
                  )
                  const cls = `block rounded-md px-2 py-1.5 ${isActive ? "bg-accent" : "hover:bg-accent/60"}`
                  return (
                    <li key={r.name}>
                      {isReal ? (
                        <Link
                          href={`/?month=${month}&region=${encodeURIComponent(r.name)}`}
                          className={cls}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="px-2 py-1.5">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Ranking Table */}
        <Panel
          title="Ranking de clínicas"
          subtitle={
            region
              ? `ordenado por taxa · região ${region}`
              : "ordenado por taxa de agendamento"
          }
        >
          <RankingTable rows={filteredRows} />
        </Panel>
      </div>
    </main>
  )
}

