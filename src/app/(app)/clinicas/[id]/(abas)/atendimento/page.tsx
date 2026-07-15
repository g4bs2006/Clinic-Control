// Aba "Atendimento" — as conversas da clínica: IA vs humano, tempo de resposta
// no grupo, resumo diário por IA, atributos de leads e relatório de conversas.
import Link from "next/link"
import { notFound } from "next/navigation"
import { getClinic } from "@/lib/clinics/actions"
import { getHelenaCustomFieldsAggregation, getHelenaTakeoverStats } from "@/lib/clinics/integration-actions"
import { monthKey, DATA_START_MONTH } from "@/lib/snapshots/month"
import { getClinicResponseStats, listClinicSummaries } from "@/lib/whatsapp/actions"
import { fmtDuration } from "@/lib/whatsapp/format"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { listReportJobs } from "@/lib/reports/actions"
import { ReportPanel } from "@/components/reports/report-panel"
import { fmtPct, shortMonthLabel } from "../shared"

export const dynamic = "force-dynamic"

export default async function ClinicAtendimentoPage({
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

  const [takeoverRes, responseStats, summaries, helenaCustomFieldsRes, reportJobs] =
    await Promise.all([
      isAuto ? getHelenaTakeoverStats(id, currentMonth) : Promise.resolve(null),
      getClinicResponseStats(id),
      listClinicSummaries(id),
      isAuto ? getHelenaCustomFieldsAggregation(id, currentMonth) : Promise.resolve(null),
      isAuto ? listReportJobs(id) : Promise.resolve([]),
    ])

  const recentResponse = responseStats
    .filter((s) => s.year_month >= DATA_START_MONTH)
    .slice(0, 6)
  const hasTakeover = Boolean(takeoverRes?.ok && takeoverRes.stats.total > 0)
  const hasCustomFields = Boolean(
    isAuto && helenaCustomFieldsRes?.ok && Object.keys(helenaCustomFieldsRes.counts).length > 0,
  )
  const nothingToShow =
    !hasTakeover && recentResponse.length === 0 && summaries.length === 0 && !hasCustomFields && !isAuto

  return (
    <>
      {nothingToShow && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Sem dados de atendimento ainda — eles aparecem quando a clínica tem grupo de
            WhatsApp monitorado ou integração automática com a Helena.
          </p>
        </Panel>
      )}

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
      {recentResponse.length > 0 && (() => {
        const current = responseStats.find((s) => s.year_month === currentMonth)
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
              {recentResponse.map((s) => (
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
                      href={`/clinicas/${id}/atendimento?resumo=${d}`}
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

      {/* ── Custom Fields Aggregation (CRM Helena) ──────────────── */}
      {hasCustomFields && helenaCustomFieldsRes?.ok && (
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

      {/* ── Relatório de conversas (análise IA) ────────────────── */}
      {isAuto && (
        <Panel
          title="Relatório de conversas"
          subtitle="análise das conversas da IA no período: funil E0-E8, agendamentos estimados por keyword e planilha para o cliente"
        >
          <ReportPanel clinicId={id} initialJobs={reportJobs} />
        </Panel>
      )}
    </>
  )
}
