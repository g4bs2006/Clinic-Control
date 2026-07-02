import Link from "next/link"
import { getPortfolioForMonth } from "@/lib/portfolio/data"
import { summarize } from "@/lib/portfolio/aggregate"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { PortfolioFilters } from "@/components/dashboard/portfolio-filters"
import { PortfolioMap, type MapPoint } from "@/components/map/portfolio-map"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ month?: string; region?: string }>

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

const fmtPct = (rate: number) =>
  (rate * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + "%"
const fmtNum = (n: number) => n.toLocaleString("pt-BR")

export default async function MapaPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const currentMonth = monthKey(new Date())
  const rawMonth = params.month ?? ""
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth

  const { rows } = await getPortfolioForMonth(month)

  // Regions for the filter
  const regions = Array.from(
    new Set(rows.map((r) => r.region).filter((r): r is string => !!r)),
  ).sort()
  const rawRegion = params.region ?? ""
  const region = regions.includes(rawRegion) ? rawRegion : ""

  const scoped = region ? rows.filter((r) => r.region === region) : rows

  // KPIs + status distribution for the scoped set
  const summary = summarize(scoped)

  // Points with coordinates → map markers
  const points: MapPoint[] = scoped
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      clinicId: r.clinicId,
      name: r.name,
      city: r.city,
      state: r.state,
      rate: r.rate,
      status: r.status,
      statusColor: r.statusColor,
      leads: r.leads,
      scheduled: r.scheduled,
      mode: r.mode,
      lat: r.lat as number,
      lng: r.lng as number,
    }))

  // Clinics without coordinates → listed apart
  const noCoords = scoped.filter((r) => r.lat == null || r.lng == null)

  // Region performance over ALL rows (so the panel always offers every region
  // to filter by, regardless of the current region filter).
  const regionAgg = new Map<string, { sum: number; count: number; leads: number }>()
  for (const r of rows) {
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

  const monthOptions = lastNMonths(currentMonth, 12)
    .filter((k) => k >= DATA_START_MONTH)
    .map((k) => ({ key: k, label: monthLabel(k) }))

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold brand-header">Mapa da carteira</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {monthLabel(month)}
            <span className="lowercase">
              {" "}· {points.length} clínica{points.length !== 1 ? "s" : ""} no mapa
            </span>
            {region && <span className="text-primary"> · {region}</span>}
          </p>
        </div>
        <PortfolioFilters
          month={month}
          region={region}
          regions={regions}
          monthOptions={monthOptions}
          basePath="/mapa"
        />
      </div>

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="No mapa" value={fmtNum(points.length)} accent="teal" />
        <KpiCard label="Taxa média" value={fmtPct(summary.avgRate)} accent="purple" hint="agendados / leads" />
        <KpiCard label="Leads" value={fmtNum(summary.totalLeads)} />
        <KpiCard label="Agendados" value={fmtNum(summary.totalScheduled)} accent="rose" />
      </div>

      {/* ── Map + side panels ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(260px,320px)]">
        <Panel
          title="Distribuição geográfica"
          subtitle="ponto colorido pelo status · tamanho pelo volume de leads"
        >
          {points.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <span className="text-2xl opacity-40">—</span>
              <span className="text-sm">Nenhuma clínica com coordenadas</span>
              <span className="text-xs opacity-70">
                Cadastre o endereço da clínica para geocodificar a localização.
              </span>
            </div>
          ) : (
            <PortfolioMap points={points} />
          )}

          {/* Status legend + counts */}
          {summary.statusDistribution.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
              {summary.statusDistribution.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold tabular-nums text-foreground">{s.count}</span>
                </span>
              ))}
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          {/* Region performance — clickable to filter */}
          <Panel title="Performance por região" subtitle="taxa média · clique para filtrar">
            {region && (
              <Link
                href={`/mapa?month=${month}`}
                className="-mt-1 mb-1 inline-block text-xs text-primary hover:underline"
              >
                × limpar filtro de região
              </Link>
            )}
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
                          {fmtPct(r.avgRate)}
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
                          {r.count} clín. · {fmtNum(r.leads)} leads
                        </span>
                      </div>
                    </>
                  )
                  const cls = `block rounded-md px-2 py-1.5 ${isActive ? "bg-accent" : "hover:bg-accent/60"}`
                  return (
                    <li key={r.name}>
                      {isReal ? (
                        <Link href={`/mapa?month=${month}&region=${encodeURIComponent(r.name)}`} className={cls}>
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

          {/* Clinics without location */}
          {noCoords.length > 0 && (
            <Panel
              title="Sem localização"
              subtitle={`${noCoords.length} clínica${noCoords.length !== 1 ? "s" : ""} sem coordenadas`}
            >
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {noCoords.map((r) => (
                  <li key={r.clinicId} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/clinicas/${r.clinicId}`}
                      className="text-brand-gradient hover:opacity-85 font-medium transition-opacity"
                    >
                      {r.name}
                    </Link>
                    {(r.city || r.state) && (
                      <span className="text-xs">
                        {[r.city, r.state].filter(Boolean).join("/")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </main>
  )
}
