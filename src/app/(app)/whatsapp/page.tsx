import Link from "next/link"
import { listClinics } from "@/lib/clinics/actions"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import {
  listResponseStats,
  listDailySummaries,
  listSummaryDates,
  listWhatsappGroups,
  getLastCollectedAt,
} from "@/lib/whatsapp/actions"
import { fmtDuration } from "@/lib/whatsapp/format"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { PortfolioFilters } from "@/components/dashboard/portfolio-filters"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ month?: string; date?: string }>

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function dateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
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

const SENTIMENT_STYLE: Record<string, { label: string; cls: string }> = {
  positivo: { label: "Positivo", cls: "bg-emerald-500/15 text-emerald-400" },
  neutro: { label: "Neutro", cls: "bg-zinc-500/15 text-zinc-400" },
  negativo: { label: "Negativo", cls: "bg-red-500/15 text-red-400" },
}

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const currentMonth = monthKey(new Date())
  const rawMonth = params.month ?? ""
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth

  const [clinics, stats, groups, summaryDates, lastCollectedAt] = await Promise.all([
    listClinics(),
    listResponseStats(month),
    listWhatsappGroups(),
    listSummaryDates(),
    getLastCollectedAt(),
  ])

  // Dia dos resumos: param válido, senão o mais recente com resumo
  const rawDate = params.date ?? ""
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : summaryDates[0] ?? new Date().toISOString().slice(0, 10)
  const summaries = await listDailySummaries(date)

  const nameById = new Map(clinics.map((c) => [c.id, c.name]))
  const mappedGroups = groups.filter((g) => g.clinic_id).length

  const rows = stats
    .filter((s) => nameById.has(s.clinic_id))
    .map((s) => ({
      ...s,
      name: nameById.get(s.clinic_id)!,
    }))
    .sort((a, b) => (b.median_seconds ?? -1) - (a.median_seconds ?? -1))

  const medians = rows
    .map((r) => r.median_seconds)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)
  const portfolioMedian = medians.length ? medians[Math.floor(medians.length / 2)] : null
  const totalEpisodes = rows.reduce((sum, r) => sum + r.episodes, 0)
  const totalUnanswered = rows.reduce((sum, r) => sum + r.unanswered, 0)

  const monthOptions = lastNMonths(currentMonth, 12)
    .filter((k) => k >= DATA_START_MONTH)
    .map((k) => ({ key: k, label: monthLabel(k) }))

  const lastCollectedLabel = lastCollectedAt
    ? new Date(lastCollectedAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "—"

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {monthLabel(month)} · tempo de resposta e resumos diários dos grupos
          </p>
        </div>
        <PortfolioFilters
          month={month}
          region=""
          regions={[]}
          monthOptions={monthOptions}
          basePath="/whatsapp"
        />
      </div>

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Mediana da carteira"
          value={fmtDuration(portfolioMedian)}
          accent="teal"
          hint="tempo até resposta humana"
        />
        <KpiCard label="Conversas" value={totalEpisodes.toLocaleString("pt-BR")} accent="purple" />
        <KpiCard label="Sem resposta" value={totalUnanswered.toLocaleString("pt-BR")} accent="rose" />
        <KpiCard
          label="Última coleta"
          value={lastCollectedLabel}
          hint={`${mappedGroups}/${groups.length} grupos mapeados · diária às 18h`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_minmax(380px,480px)]">
        {/* ── Tabela por clínica ─────────────────────────────────── */}
        <Panel
          title="Tempo de resposta por clínica"
          subtitle="ordenado da mais lenta para a mais rápida (mediana do mês)"
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem conversas no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Clínica</th>
                    <th className="py-2 px-3 text-right font-semibold">Mediana</th>
                    <th className="py-2 px-3 text-right font-semibold">Média</th>
                    <th className="py-2 px-3 text-right font-semibold">Conversas</th>
                    <th className="py-2 pl-3 text-right font-semibold">Sem resposta</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.clinic_id} className="border-b border-border/30 hover:bg-accent/40">
                      <td className="py-2 pr-3">
                        <Link href={`/clinicas/${r.clinic_id}`} className="text-primary hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">
                        {fmtDuration(r.median_seconds)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {fmtDuration(r.avg_seconds)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.episodes}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {r.unanswered > 0 ? (
                          <span className="text-red-400">{r.unanswered}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ── Resumos diários ────────────────────────────────────── */}
        <Panel
          title="Resumo diário por IA"
          subtitle={`${dateLabel(date)} · gerado após a coleta das 18h`}
        >
          {summaryDates.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {summaryDates.slice(0, 7).map((d) => (
                <Link
                  key={d}
                  href={`/whatsapp?month=${month}&date=${d}`}
                  className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-medium transition-colors ${
                    d === date
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                </Link>
              ))}
            </div>
          )}

          {summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum resumo para este dia ainda. O agente roda diariamente às 18h45
              (após a coleta) para as clínicas com conversa no dia.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 max-h-[720px] overflow-y-auto pr-1">
              {summaries.map((s) => {
                const sentiment = SENTIMENT_STYLE[s.highlights?.sentimento ?? "neutro"]
                return (
                  <li
                    key={s.clinic_id}
                    className="rounded-md border border-border/60 bg-accent/20 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/clinicas/${s.clinic_id}`}
                        className="text-sm font-semibold text-foreground hover:underline truncate"
                      >
                        {nameById.get(s.clinic_id) ?? "Clínica"}
                      </Link>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {s.highlights?.risco_churn && (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-red-400">
                            Risco churn
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${sentiment.cls}`}
                        >
                          {sentiment.label}
                        </span>
                      </span>
                    </div>

                    <div className="md-prose text-xs text-muted-foreground [&_p]:my-1 [&_ul]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.summary_md}</ReactMarkdown>
                    </div>

                    {(s.highlights?.pendencias?.length ?? 0) > 0 && (
                      <div className="text-[0.7rem]">
                        <span className="font-semibold text-amber-400/90">Pendências: </span>
                        <span className="text-muted-foreground">
                          {s.highlights!.pendencias!.join(" · ")}
                        </span>
                      </div>
                    )}
                    {(s.highlights?.reclamacoes?.length ?? 0) > 0 && (
                      <div className="text-[0.7rem]">
                        <span className="font-semibold text-red-400/90">Reclamações: </span>
                        <span className="text-muted-foreground">
                          {s.highlights!.reclamacoes!.join(" · ")}
                        </span>
                      </div>
                    )}
                    <div className="text-[0.62rem] text-muted-foreground/60 tabular-nums">
                      {s.message_count} mensagens · {s.model ?? "—"}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  )
}
