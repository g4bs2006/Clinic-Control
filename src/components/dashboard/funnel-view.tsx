import { Users, Calendar, Eye, CheckCircle2 } from "lucide-react"

interface FunnelStep {
  title: string
  count: number
}

interface FunnelViewProps {
  steps: FunnelStep[]
}

const fmt = (n: number) => n.toLocaleString("pt-BR")
const pct = (n: number, d: number) =>
  d > 0 ? ((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "0%"

export function FunnelView({ steps }: FunnelViewProps) {
  const by = new Map(steps.map((s) => [s.title, s.count]))
  const g = (t: string) => by.get(t) ?? 0

  const leads = g("Leads")
  const agendados = g("Agendados")
  const compareceram = g("Compareceram e Não Fecharam") + g("Compareceram e Fecharam")
  const fecharam = g("Compareceram e Fecharam")

  // Monotonic levels of the funnel with corresponding icons
  const levels = [
    { name: "Leads", count: leads, prev: null as number | null, icon: Users, color: "from-blue-500 to-cyan-400" },
    { name: "Agendados", count: agendados, prev: leads, icon: Calendar, color: "from-indigo-500 to-blue-500" },
    { name: "Compareceram", count: compareceram, prev: agendados, icon: Eye, color: "from-purple-500 to-indigo-500" },
    { name: "Fecharam", count: fecharam, prev: compareceram, icon: CheckCircle2, color: "from-emerald-500 to-teal-400" },
  ]

  const top = Math.max(1, leads)

  // Other outcomes (non-core funnel stages)
  const CORE = new Set([
    "Leads",
    "Agendados",
    "Compareceram e Não Fecharam",
    "Compareceram e Fecharam",
  ])
  const outcomes = steps.filter((s) => !CORE.has(s.title) && s.count > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Premium Connected Vertical Timeline Funnel ── */}
      <div className="relative flex flex-col gap-4 pl-4 sm:pl-6">
        
        {/* Continuous Connecting line in the background */}
        <div className="absolute bottom-6 left-9 top-6 w-0.5 bg-gradient-to-b from-blue-500/40 via-indigo-500/25 to-emerald-500/10" />

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
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[0.65rem] font-semibold text-blue-400 border border-blue-500/15">
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

      {/* ── Outcomes / Detalhamento ── */}
      {outcomes.length > 0 && (
        <div className="border-t border-border/40 pt-4 mt-2">
          <h4 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Para onde foram os leads
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
