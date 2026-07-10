import Link from "next/link"
import { listClinics } from "@/lib/clinics/actions"
import { getCarteiraScope } from "@/lib/users/actions"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import {
  listResponseStats,
  listDailySummaries,
  listSummaryDates,
  listWhatsappGroups,
  getLastCollectedAt,
  getEvolutionHealth,
} from "@/lib/whatsapp/actions"
import { fmtDuration } from "@/lib/whatsapp/format"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { PortfolioFilters } from "@/components/dashboard/portfolio-filters"
import { getHelenaAccountOverview, listHelenaTeamsAndUsers } from "@/lib/clinics/integration-actions"
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

  const [allClinics, stats, allGroups, summaryDates, lastCollectedAt, health, scope] = await Promise.all([
    listClinics(),
    listResponseStats(month),
    listWhatsappGroups(),
    listSummaryDates(),
    getLastCollectedAt(),
    getEvolutionHealth(),
    getCarteiraScope(),
  ])

  // Escopo por carteira: desenvolvedor vê só as suas clínicas; gestor vê todas.
  const clinics = scope.developerFilter
    ? allClinics.filter((c) => c.developer_id === scope.developerFilter)
    : allClinics
  const scopedIds = new Set(clinics.map((c) => c.id))
  const groups = scope.developerFilter
    ? allGroups.filter((g) => g.clinic_id && scopedIds.has(g.clinic_id))
    : allGroups

  // Fetch Helena account overview, users and teams for automatic clinics
  const autoClinics = clinics.filter((c) => c.mode === "auto")
  const overviewsAndTeams = await Promise.all(
    autoClinics.map(async (c) => {
      const [overview, teamsAndUsers] = await Promise.all([
        getHelenaAccountOverview(c.id),
        listHelenaTeamsAndUsers(c.id),
      ])
      return { clinicId: c.id, name: c.name, overview, teamsAndUsers }
    })
  )

  // Dia dos resumos: param válido, senão o mais recente com resumo
  const rawDate = params.date ?? ""
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : summaryDates[0] ?? new Date().toISOString().slice(0, 10)
  const allSummaries = await listDailySummaries(date)
  const summaries = scope.developerFilter
    ? allSummaries.filter((s) => scopedIds.has(s.clinic_id))
    : allSummaries

  const nameById = new Map(clinics.map((c) => [c.id, c.name]))
  const mappedGroups = groups.filter((g) => g.clinic_id).length

  // Todas as clínicas com grupo mapeado entram na tabela; sem conversa no mês = "—"
  const statByClinic = new Map(stats.map((s) => [s.clinic_id, s]))
  const mappedClinicIds = [...new Set(
    groups.map((g) => g.clinic_id).filter((id): id is string => !!id && nameById.has(id)),
  )]
  const allMapped = mappedClinicIds.map((clinicId) => {
    const s = statByClinic.get(clinicId)
    return {
      clinic_id: clinicId,
      name: nameById.get(clinicId)!,
      episodes: s?.episodes ?? 0,
      answered: s?.answered ?? 0,
      unanswered: s?.unanswered ?? 0,
      avg_seconds: s?.avg_seconds ?? null,
      median_seconds: s?.median_seconds ?? null,
      hasData: !!s,
    }
  })
  const rows = allMapped
    .filter((r) => r.hasData)
    .sort((a, b) => (b.median_seconds ?? -1) - (a.median_seconds ?? -1))
  const idleClinics = allMapped
    .filter((r) => !r.hasData)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

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
    <main className="p-4 space-y-6 sm:p-6 max-w-screen-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold brand-header">Gerenciador de grupos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {monthLabel(month)} · tempo de resposta e resumos diários dos grupos de WhatsApp
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

      {/* ── Alerta de conexão da instância ─────────────────────── */}
      {health && !health.ok && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
          <span className="size-2 shrink-0 rounded-full bg-red-400 animate-pulse" />
          <div className="text-sm">
            <span className="font-semibold text-red-400">
              Instância do WhatsApp fora do ar
            </span>{" "}
            <span className="text-muted-foreground">
              (estado: {health.state ?? "desconhecido"}
              {health.down_since && (
                <>
                  {" "}desde{" "}
                  {new Date(health.down_since).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Sao_Paulo",
                  })}
                </>
              )}
              ). Reconecte no painel da Evolution — mensagens enviadas durante a
              queda podem ser perdidas.
            </span>
          </div>
        </div>
      )}

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
          hint={`${mappedGroups}/${groups.length} grupos mapeados · coleta 4x/dia · conexão ${
            health ? (health.ok ? "ativa" : "CAÍDA") : "—"
          }`}
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
                        <Link href={`/clinicas/${r.clinic_id}`} className="text-brand-gradient hover:opacity-85 font-medium transition-opacity">
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

          {idleClinics.length > 0 && (
            <p className="border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-[0.65rem]">
                Sem conversa no mês ({idleClinics.length}):
              </span>{" "}
              {idleClinics.map((r, i) => (
                <span key={r.clinic_id}>
                  {i > 0 && " · "}
                  <Link
                    href={`/clinicas/${r.clinic_id}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {r.name}
                  </Link>
                </span>
              ))}
            </p>
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
                      ? "bg-brand text-white border-transparent shadow"
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
                        className="text-sm font-bold text-brand-gradient hover:opacity-85 transition-opacity truncate"
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

      {/* ── Canais e Equipe (Helena) ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel 
          title="Status de Conexão dos Canais"
          subtitle="canais de comunicação ativos na Helena e conectividade em tempo real"
        >
          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
            {overviewsAndTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma clínica configurada em modo automático.</p>
            ) : (
              overviewsAndTeams.map(({ clinicId, name, overview }) => {
                if (!overview.ok) return null
                const channels = overview.channels ?? []
                return (
                  <div key={clinicId} className="grid gap-2 border-b border-border/30 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[230px_1fr] sm:items-start">
                    <div className="min-w-0">
                      <Link href={`/clinicas/${clinicId}`} className="text-sm font-semibold text-brand-gradient hover:opacity-85 transition-opacity">
                        {name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Base: {overview.contactCount ? overview.contactCount.toLocaleString("pt-BR") : "0"} pacientes · Conta: {overview.company?.status ?? "Ativa"}
                      </p>
                    </div>
                    <div className="flex flex-wrap content-start gap-1.5">
                      {channels.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Nenhum canal ativo</span>
                      ) : (
                        channels.map((c) => {
                          const isOnline = ["connected", "active", "online", "stable", "paired", "authenticated"].includes(c.status?.toLowerCase())
                          return (
                            <span 
                              key={c.id} 
                              className={`rounded px-2 py-0.5 text-[0.7rem] font-medium flex items-center gap-1 ${
                                isOnline 
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
                              {c.name || c.type || "Canal"} ({isOnline ? "Ativo" : "Inativo"})
                            </span>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Panel>

        <Panel
          title="Operadores e Setores"
          subtitle="agentes e equipes configuradas no atendimento de cada unidade"
        >
          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
            {overviewsAndTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma clínica configurada em modo automático.</p>
            ) : (
              overviewsAndTeams.map(({ clinicId, name, teamsAndUsers }) => {
                if (!teamsAndUsers.ok) return null
                const { departments, users } = teamsAndUsers
                const activeUsers = users.filter(u => u.active)
                return (
                  <div key={clinicId} className="grid gap-2 border-b border-border/30 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[230px_1fr] sm:items-start">
                    <div className="min-w-0">
                      <Link href={`/clinicas/${clinicId}`} className="text-sm font-semibold text-brand-gradient hover:opacity-85 transition-opacity">
                        {name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeUsers.length} operador{activeUsers.length === 1 ? "" : "es"} ativo{activeUsers.length === 1 ? "" : "s"} · Setores:{" "}
                        {departments.length === 0 ? "Geral" : departments.map((d) => d.name).join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap content-start gap-1.5">
                      {activeUsers.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Nenhum operador ativo</span>
                      ) : (
                        activeUsers.map((u) => (
                          <span
                            key={u.id}
                            title={u.email ?? undefined}
                            className="rounded px-2 py-0.5 text-[0.7rem] font-medium flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {u.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Panel>
      </div>
    </main>
  )
}
