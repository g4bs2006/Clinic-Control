import Link from "next/link"
import { getPortfolioForMonth } from "@/lib/portfolio/data"
import { summarize } from "@/lib/portfolio/aggregate"
import { getCarteiraScope } from "@/lib/users/actions"
import { monthKey, prevMonth, DATA_START_MONTH } from "@/lib/snapshots/month"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Panel } from "@/components/dashboard/panel"
import { StatusDonut } from "@/components/dashboard/status-donut"
import { RankingSection } from "@/components/dashboard/ranking-section"
import { PortfolioFilters } from "@/components/dashboard/portfolio-filters"
import { listCheckItems, listAllClinicChecks } from "@/lib/clinics/check-items-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listAttentionSummaries } from "@/lib/whatsapp/actions"
import { countMyPendingTasks } from "@/lib/tasks/actions"
import { getCarteiraHealth } from "@/lib/health/data"
import { HEALTH_HINT } from "@/lib/health/score"
import { HealthBadge } from "@/components/dashboard/health-badge"
import { CheckCircle2, ListTodo, ArrowDown, ArrowUp } from "lucide-react"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ month?: string; region?: string; dev?: string }>

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

  // Fetch portfolio data, check items, all checks, raw clinics and WhatsApp stats
  const [portfolioData, checkItems, allChecksMap, rawClinics, rawAttentionSummaries, scope, myPendingTasks] = await Promise.all([
    getPortfolioForMonth(month),
    listCheckItems(),
    listAllClinicChecks(),
    listClinics(),
    listAttentionSummaries(),
    getCarteiraScope(params.dev),
    countMyPendingTasks(),
  ])

  // Escopo por carteira: desenvolvedor vê só a sua; gestor pode filtrar (?dev=).
  const allRows = scope.developerFilter
    ? portfolioData.rows.filter((r) => r.developerId === scope.developerFilter)
    : portfolioData.rows
  const summary = scope.developerFilter ? summarize(allRows) : portfolioData.summary
  const scopedClinicIds = new Set(allRows.map((r) => r.clinicId))
  const attentionSummaries = scope.developerFilter
    ? rawAttentionSummaries.filter((s) => scopedClinicIds.has(s.clinic_id))
    : rawAttentionSummaries
  const carteiraLabel = scope.developerFilter
    ? (scope.developerOptions.find((d) => d.id === scope.developerFilter)?.name ??
        scope.profile?.name ??
        "minha carteira")
    : null

  // Convert Map<string, Map<string, boolean>> to Record<string, Record<string, boolean>>
  const allChecks: Record<string, Record<string, boolean>> = {}
  for (const [clinicId, checksMap] of allChecksMap) {
    allChecks[clinicId] = Object.fromEntries(checksMap)
  }

  // Derive distinct, sorted regions from all rows (non-null only) — o filtro de
  // região é aplicado NO CLIENTE (RankingSection), sem round-trip ao servidor.
  const regions = Array.from(
    new Set(allRows.map((r) => r.region).filter((r): r is string => !!r))
  ).sort()

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

  const nameByClinicId = new Map(allRows.map((r) => [r.clinicId, r.name]))

  // ── Health score da carteira (snapshot diário, sob demanda) ─────────────────
  // Passa a taxa do mês corrente já resolvida (evita rebuscar a Helena) só quando
  // o dashboard está no mês atual; em meses passados o health lê o snapshot do dia.
  const currentRateOverride =
    month === currentMonth
      ? new Map(allRows.filter((r) => r.source !== "none").map((r) => [r.clinicId, r.rate]))
      : null
  const healthMap = await getCarteiraHealth(
    allRows.map((r) => r.clinicId),
    currentRateOverride,
  )

  // Clínicas que precisam de atenção: Risco primeiro, depois Atenção, por score
  // crescente. Cada uma com o principal motivo e o delta desde ontem.
  const bandRank: Record<string, number> = { risco: 0, atencao: 1, saudavel: 2 }
  const healthAttention = [...healthMap.values()]
    .filter((h) => h.status === "scored" && (h.band === "risco" || h.band === "atencao"))
    .sort((a, b) => (bandRank[a.band!] - bandRank[b.band!]) || (a.score! - b.score!))
    .slice(0, 6)
    .map((h) => {
      const worst = h.factors.filter((f) => f.score < 50).sort((a, b) => b.drag - a.drag)[0]
      const delta = h.prevScore != null && h.score != null ? h.score - h.prevScore : null
      return {
        clinicId: h.clinicId,
        name: nameByClinicId.get(h.clinicId) ?? rawClinics.find((c) => c.id === h.clinicId)?.name ?? "Clínica",
        score: h.score,
        band: h.band,
        confidence: h.confidence,
        reason: worst ? HEALTH_HINT[worst.key] : null,
        delta,
        droppedBand: h.prevBand && h.band && bandRank[h.band] < bandRank[h.prevBand],
      }
    })

  // ── Prepare CSV Export Data (todas as linhas; a região filtra no cliente) ──
  const exportData = allRows.map((row) => {
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
            {carteiraLabel && (
              <span className="ml-1 text-primary">· carteira {carteiraLabel}</span>
            )}
          </p>
        </div>

        {/* Filtro de mês (região fica no card do ranking, filtrada no cliente) */}
        <div className="flex flex-wrap items-center gap-3">
          <PortfolioFilters
            month={month}
            region={null}
            regions={[]}
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
          <Panel title="Status de implantação" subtitle="progresso do seu checklist na carteira">
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

          {/* ── Minhas tarefas ──────────────────────────────────── */}
          <Link href="/tarefas" className="block">
            <Panel className="transition-colors hover:bg-accent/40">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
                  <ListTodo className="size-4.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Minhas tarefas</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {myPendingTasks} pendente{myPendingTasks !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </Panel>
          </Link>

          {/* ── Atenção · Resumos IA (WhatsApp) ──────────────────── */}
          <Panel
            title="Atenção · Resumos IA"
            subtitle="sinais negativos no grupo de WhatsApp (últimos 7 dias)"
          >
            {attentionSummaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-500/80 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Nenhum sinal de atenção nos resumos recentes.
                </p>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {attentionSummaries.map((s) => {
                  const clinicName =
                    nameByClinicId.get(s.clinic_id) ??
                    rawClinics.find((c) => c.id === s.clinic_id)?.name ??
                    "Clínica"
                  const dayLabel = `${s.summary_date.slice(8, 10)}/${s.summary_date.slice(5, 7)}`
                  return (
                    <li
                      key={s.clinic_id}
                      className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-accent/30 p-2.5 hover:bg-accent/60 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/clinicas/${s.clinic_id}?resumo=${s.summary_date}`}
                          className="text-xs font-semibold text-foreground hover:underline truncate"
                        >
                          {clinicName}
                        </Link>
                        <span className="flex items-center gap-1 shrink-0">
                          {s.highlights?.risco_churn && (
                            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-red-400">
                              Churn
                            </span>
                          )}
                          {s.highlights?.sentimento === "negativo" && (
                            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-red-400">
                              Negativo
                            </span>
                          )}
                          <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                            {dayLabel}
                          </span>
                        </span>
                      </div>
                      {(s.highlights?.reclamacoes?.length ?? 0) > 0 && (
                        <p className="text-[0.7rem] leading-snug text-muted-foreground line-clamp-2">
                          <span className="font-semibold text-red-400/90">Reclamações: </span>
                          {s.highlights!.reclamacoes!.join(" · ")}
                        </p>
                      )}
                      {(s.highlights?.pendencias?.length ?? 0) > 0 && (
                        <p className="text-[0.7rem] leading-snug text-muted-foreground line-clamp-2">
                          <span className="font-semibold text-amber-400/90">Pendências: </span>
                          {s.highlights!.pendencias!.join(" · ")}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {/* ── Saúde da carteira ────────────────────────────────── */}
          <Panel title="Saúde da carteira" subtitle="prioridade de atenção · o que mudou desde ontem">
            {healthAttention.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-500/80 mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma clínica em risco ou atenção.</p>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {healthAttention.map((h) => (
                  <li
                    key={h.clinicId}
                    className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-accent/30 p-2.5 hover:bg-accent/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/clinicas/${h.clinicId}`} className="text-xs font-semibold text-foreground hover:underline truncate">
                        {h.name}
                      </Link>
                      <HealthBadge score={h.score} band={h.band} confidence={h.confidence} />
                    </div>
                    <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
                      <span className="truncate">{h.reason ?? "—"}</span>
                      <span className="flex items-center gap-1 shrink-0 tabular-nums">
                        {h.droppedBand ? (
                          <span className="text-red-400 font-medium">piorou de banda</span>
                        ) : h.delta != null && h.delta !== 0 ? (
                          <>
                            {h.delta < 0 ? (
                              <ArrowDown className="size-3 text-red-400" />
                            ) : (
                              <ArrowUp className="size-3 text-emerald-400" />
                            )}
                            <span className={h.delta < 0 ? "text-red-400" : "text-emerald-400"}>
                              {Math.abs(h.delta)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground/60">estável</span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

        </div>

        {/* Ranking + filtro de região (client-side) + exportar */}
        <RankingSection
          rows={allRows}
          regions={regions}
          exportData={exportData}
          exportFilename={`relatorio-performance-${month}`}
        />
      </div>
    </main>
  )
}

