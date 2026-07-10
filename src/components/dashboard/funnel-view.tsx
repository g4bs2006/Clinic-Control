import { Users, Calendar, Eye, CheckCircle2 } from "lucide-react"

interface FunnelStep {
  title: string
  count: number
}

/** Totais do funil (mapping-aware) — vêm de buildLiveFunnel, então respeitam o
 *  mapeamento de colunas da clínica com fallback canônico. Substituem a antiga
 *  derivação por título canônico, que zerava em painéis fora do padrão. */
interface FunnelTotals {
  leads: number
  scheduled: number
  attended: number
  closed: number
  noShow: number
  notScheduled: number
}

interface FunnelViewProps {
  steps: FunnelStep[]
  totals: FunnelTotals
}

const fmt = (n: number) => n.toLocaleString("pt-BR")
const pct = (n: number, d: number) =>
  d > 0 ? ((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "0%"

export function FunnelView({ steps, totals }: FunnelViewProps) {
  // Monotonic levels of the funnel with corresponding icons
  const levels = [
    { name: "Leads", count: totals.leads, prev: null as number | null, icon: Users, color: "from-violet-600 to-fuchsia-500" },
    { name: "Agendaram", count: totals.scheduled, prev: totals.leads, icon: Calendar, color: "from-fuchsia-500 to-pink-500" },
    { name: "Compareceram", count: totals.attended, prev: totals.scheduled, icon: Eye, color: "from-pink-500 to-rose-500" },
    { name: "Fecharam", count: totals.closed, prev: totals.attended, icon: CheckCircle2, color: "from-rose-500 to-red-500" },
  ]

  const top = Math.max(1, totals.leads)

  // Detalhamento: todas as colunas reais do painel com card no mês.
  const outcomes = steps.filter((s) => s.count > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Premium Connected Vertical Timeline Funnel ── */}
      <div className="relative flex flex-col gap-4 pl-4 sm:pl-6">
        
        {/* Continuous Connecting line in the background */}
        <div className="absolute bottom-6 left-9 top-6 w-0.5 bg-gradient-to-b from-violet-500/40 via-pink-500/25 to-red-500/10" />

        {levels.map((lvl) => {
          const Icon = lvl.icon
          // Percentage relative to first step (Leads)
          const pctOfTotal = (lvl.count / top) * 100
          // Percentage relative to previous step
          const convRate = lvl.prev !== null ? pct(lvl.count, lvl.prev) : null

          return (
            <div key={lvl.name} className="relative flex flex-col gap-2">
              {/* Timeline dot / Icon */}
              <div className="absolute -left-[27px] sm:-left-[35px] top-3 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background shadow-md">
                <Icon className="size-4 text-primary" />
              </div>

              {/* Step Card */}
              <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-accent/20 p-4 transition-all duration-200 hover:border-border hover:bg-accent/40">
                
                {/* Header: Name, Count and Conversion Badge */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                      {lvl.name}
                    </span>
                    <span className="text-xl font-bold tabular-nums text-foreground mt-0.5">
                      {fmt(lvl.count)}
                    </span>
                  </div>

                  {/* Conversion pill */}
                  <div className="text-right">
                    {convRate === null ? (
                      <span className="rounded-full bg-brand-solid/10 px-2.5 py-0.5 text-[0.65rem] font-semibold text-brand-text border border-brand-solid/15">
                        Base
                      </span>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-emerald-400 border border-emerald-500/15 tabular-nums">
                          {convRate}
                        </span>
                        <span className="text-[0.55rem] text-muted-foreground mt-0.5">
                          do nível anterior
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar relative to Leads */}
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${lvl.color} transition-all duration-500`}
                      style={{ width: `${pctOfTotal}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[0.6rem] text-muted-foreground">
                    <span>Participação da base</span>
                    <span className="tabular-nums">{pctOfTotal.toFixed(1)}%</span>
                  </div>
                </div>

              </div>
            </div>
          )
        })}
      </div>

      {/* ── Vazamentos do funil ── */}
      {(totals.noShow > 0 || totals.notScheduled > 0) && (
        <div className="-mt-2 flex flex-wrap gap-2">
          {totals.notScheduled > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
              Não agendaram: <strong className="tabular-nums">{fmt(totals.notScheduled)}</strong>
              <span className="text-amber-400/70">· {pct(totals.notScheduled, totals.leads)} dos leads</span>
            </span>
          )}
          {totals.noShow > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-400">
              No-show: <strong className="tabular-nums">{fmt(totals.noShow)}</strong>
              <span className="text-rose-400/70">· {pct(totals.noShow, totals.scheduled)} dos agendados</span>
            </span>
          )}
        </div>
      )}

      {/* ── Outcomes / Detalhamento ── */}
      {outcomes.length > 0 && (
        <div className="border-t border-border/40 pt-4 mt-2">
          <h4 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Detalhamento por coluna do painel
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {outcomes.map((o) => (
              <div
                key={o.title}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-accent/20 px-3 py-2 hover:bg-accent/40 transition-colors"
              >
                <span className="truncate text-xs text-muted-foreground" title={o.title}>
                  {o.title}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                  {fmt(o.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
