import Link from "next/link"
import { getComparison } from "@/lib/portfolio/data"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart"
import { ComparisonFilters } from "@/components/dashboard/comparison-filters"
import { SERIES_PALETTE } from "@/lib/ui/chart-theme"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ range?: string }>

// Short pt-BR month label, e.g. "abr/25"
function shortMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
  return `${month.replace(".", "")}/${String(y).slice(2)}`
}

// Build N month keys (oldest → newest), including current
function lastNMonths(current: string, n: number): string[] {
  const keys: string[] = []
  let key = current
  for (let i = 0; i < n; i++) {
    keys.unshift(key)
    key = prevMonth(key)
  }
  return keys
}

const ALLOWED_RANGES = [3, 6, 12]
const EM_DASH = "—"

function fmtPct(rate: number): string {
  return (
    (rate * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%"
  )
}

export default async function ComparativoPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const parsedRange = Number(params.range)
  const range = ALLOWED_RANGES.includes(parsedRange) ? parsedRange : 6

  const currentMonth = monthKey(new Date())
  // Nunca antes do primeiro mês com dados (maio/2026)
  const months = lastNMonths(currentMonth, range).filter((m) => m >= DATA_START_MONTH)

  const comparison = await getComparison(months)

  // Clinics with at least one data point in the window
  const withData = comparison.filter((row) =>
    months.some((m) => row.byMonth[m] != null),
  )

  // Assign a stable color per clinic (by index in withData)
  const colorByClinic = new Map<string, string>()
  withData.forEach((row, i) => {
    colorByClinic.set(row.clinicId, SERIES_PALETTE[i % SERIES_PALETTE.length])
  })

  // Chart series + data (rates already converted to %)
  const series: TrendSeries[] = withData.map((row) => ({
    key: row.name,
    color: colorByClinic.get(row.clinicId)!,
  }))

  const chartData = months.map((m) => {
    const point: Record<string, string | number | null> = {
      month: shortMonthLabel(m),
    }
    for (const row of withData) {
      const cell = row.byMonth[m]
      point[row.name] = cell ? Number((cell.rate * 100).toFixed(2)) : null
    }
    return point
  })

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Comparativo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Taxa de conversão mês a mês · {withData.length} clínica
            {withData.length !== 1 ? "s" : ""} com dados
          </p>
        </div>
        <ComparisonFilters range={range} />
      </div>

      {/* ── Trend chart ────────────────────────────────────────── */}
      <Panel
        title="Tendência da taxa de conversão"
        subtitle="clique numa clínica na legenda para mostrar ou ocultar a linha"
      >
        <TrendChart data={chartData} series={series} />
      </Panel>

      {/* ── Month-by-month table ───────────────────────────────── */}
      <Panel
        title="Taxa por mês"
        subtitle="cor = status do mês · seta = variação vs. mês anterior (pontos percentuais)"
      >
        {withData.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <span className="text-2xl opacity-40">—</span>
            <span className="text-sm">Nenhuma clínica com dados no período</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "oklch(0.64 0 0)",
                      textAlign: "left",
                      borderBottom: "1px solid oklch(0.27 0.006 286)",
                      whiteSpace: "nowrap",
                      position: "sticky",
                      left: 0,
                      background: "var(--card)",
                    }}
                  >
                    Clínica
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      style={{
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "capitalize",
                        color: "oklch(0.64 0 0)",
                        textAlign: "right",
                        borderBottom: "1px solid oklch(0.27 0.006 286)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shortMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withData.map((row) => (
                  <tr key={row.clinicId}>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.8rem",
                        borderBottom: "1px solid oklch(0.235 0 0)",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        left: 0,
                        background: "var(--card)",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "0.5rem",
                          height: "0.5rem",
                          borderRadius: "9999px",
                          background: colorByClinic.get(row.clinicId),
                          marginRight: "0.5rem",
                          verticalAlign: "middle",
                        }}
                      />
                      <Link
                        href={`/clinicas/${row.clinicId}`}
                        style={{
                          color: "oklch(0.62 0.17 255)",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        {row.name}
                      </Link>
                    </td>
                    {months.map((m, mi) => {
                      const cell = row.byMonth[m]
                      const prevCell = mi > 0 ? row.byMonth[months[mi - 1]] : null
                      // Variação vs. mês anterior, em pontos percentuais
                      const deltaPP =
                        cell && prevCell ? (cell.rate - prevCell.rate) * 100 : null
                      const dir =
                        deltaPP === null
                          ? null
                          : Math.abs(deltaPP) < 0.05
                            ? "flat"
                            : deltaPP > 0
                              ? "up"
                              : "down"
                      const deltaColor =
                        dir === "up"
                          ? "oklch(0.74 0.16 152)"
                          : dir === "down"
                            ? "oklch(0.65 0.20 25)"
                            : "oklch(0.55 0 0)"
                      const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→"
                      return (
                        <td
                          key={m}
                          style={{
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.8rem",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            borderBottom: "1px solid oklch(0.235 0 0)",
                            color: cell
                              ? "oklch(0.96 0 0)"
                              : "oklch(0.5 0 0)",
                            background:
                              cell && cell.color ? `${cell.color}26` : "transparent",
                            fontWeight: cell ? 600 : 400,
                          }}
                          title={cell?.status ?? undefined}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: "0.1rem",
                            }}
                          >
                            <span>{cell ? fmtPct(cell.rate) : EM_DASH}</span>
                            {deltaPP !== null && dir && (
                              <span
                                style={{
                                  fontSize: "0.62rem",
                                  fontWeight: 600,
                                  color: deltaColor,
                                  letterSpacing: "0.02em",
                                }}
                                title={`Variação vs. ${shortMonthLabel(months[mi - 1])} (pontos percentuais)`}
                              >
                                {arrow}{" "}
                                {Math.abs(deltaPP).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1,
                                })}
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  )
}
