import Link from "next/link"
import { getPortfolioForMonth } from "@/lib/portfolio/data"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Panel } from "@/components/dashboard/panel"
import { StatusDonut } from "@/components/dashboard/status-donut"
import { RankingTable } from "@/components/dashboard/ranking-table"
import { PortfolioFilters } from "@/components/dashboard/portfolio-filters"

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

  // Fetch portfolio data
  const { rows: allRows, summary } = await getPortfolioForMonth(month)

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
  // avgRate is a fraction 0..1; display as a percentage (e.g. 0.125 → "12,5%")
  const fmtRate = (r: number) =>
    (r * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"

  const displayMonthLabel = monthLabel(month)

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold capitalize text-foreground">
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

        {/* Filters (client component) */}
        <PortfolioFilters
          month={month}
          region={region}
          regions={regions}
          monthOptions={monthOptions}
        />
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

        {/* Status Donut + Performance por região */}
        <div className="flex flex-col gap-4">
          <Panel title="Status da carteira" subtitle="distribuição por faixa">
            <StatusDonut
              data={summary.statusDistribution}
              totalClinics={summary.clinicCount}
            />
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
                        <span className="font-semibold tabular-nums text-primary">
                          {fmtRate(r.avgRate)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
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
