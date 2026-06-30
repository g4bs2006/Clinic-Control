import { getPortfolioForMonth } from "@/lib/portfolio/data"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
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

function fmtPct(rate: number): string {
  return (
    (rate * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%"
  )
}

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
      lat: r.lat as number,
      lng: r.lng as number,
    }))

  // Clinics without coordinates → listed apart
  const noCoords = scoped.filter((r) => r.lat == null || r.lng == null)

  // Region performance: avg rate per region over clinics with data
  const regionAgg = new Map<string, { sum: number; count: number }>()
  for (const r of scoped) {
    if (r.source === "none") continue
    const key = r.region ?? "Sem região"
    const agg = regionAgg.get(key) ?? { sum: 0, count: 0 }
    agg.sum += r.rate
    agg.count += 1
    regionAgg.set(key, agg)
  }
  const regionPerformance = Array.from(regionAgg.entries())
    .map(([name, { sum, count }]) => ({ name, avgRate: sum / count, count }))
    .sort((a, b) => b.avgRate - a.avgRate)

  const monthOptions = lastNMonths(currentMonth, 12)
    .filter((k) => k >= DATA_START_MONTH)
    .map((k) => ({
      key: k,
      label: monthLabel(k),
    }))

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mapa da carteira</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {monthLabel(month)}
            <span className="lowercase">
              {" "}· {points.length} clínica{points.length !== 1 ? "s" : ""} no mapa
            </span>
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

      {/* ── Map + side panel ───────────────────────────────────── */}
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
        </Panel>

        <div className="flex flex-col gap-4">
          {/* Region performance */}
          <Panel title="Performance por região" subtitle="taxa média de conversão">
            {regionPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {regionPerformance.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground">
                      {r.name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({r.count})
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-[oklch(0.62_0.17_255)]">
                      {fmtPct(r.avgRate)}
                    </span>
                  </li>
                ))}
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
                    <span className="text-foreground/90">{r.name}</span>
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
