import { getPortfolioForMonth } from "@/lib/portfolio/data"
import { monthKey, prevMonth } from "@/lib/snapshots/month"
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

  // Month selector options — last 12 months
  const monthOptions = lastNMonths(currentMonth, 12).map((k) => ({
    key: k,
    label: monthLabel(k),
  }))

  // KPI formatting helpers (pt-BR)
  const fmtNumber = (n: number) => n.toLocaleString("pt-BR")
  const fmtRate = (r: number) =>
    r.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"

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

        {/* Status Donut */}
        <Panel title="Status da carteira" subtitle="distribuição por faixa">
          <StatusDonut
            data={summary.statusDistribution}
            totalClinics={summary.clinicCount}
          />
        </Panel>

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
