interface FunnelStep {
  title: string
  count: number
}

interface FunnelViewProps {
  steps: FunnelStep[]
}

const fmt = (n: number) => n.toLocaleString("pt-BR")
const pct = (n: number, d: number) =>
  d > 0 ? ((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"

/**
 * FunnelView — funil de conversão real (níveis monotônicos, cada um ⊆ o
 * anterior): Leads → Agendados → Compareceram → Fecharam, com a taxa de
 * conversão entre níveis. As demais etapas (desfechos) aparecem num
 * detalhamento à parte, sem distorcer a silhueta do funil.
 *
 * Server-compatible — puro, sem hooks.
 */
export function FunnelView({ steps }: FunnelViewProps) {
  const by = new Map(steps.map((s) => [s.title, s.count]))
  const g = (t: string) => by.get(t) ?? 0

  const leads = g("Leads")
  const agendados = g("Agendados")
  const compareceram = g("Compareceram e Não Fecharam") + g("Compareceram e Fecharam")
  const fecharam = g("Compareceram e Fecharam")

  // Níveis do funil (já monotônicos). pctPrev = conversão a partir do nível acima.
  const levels = [
    { name: "Leads", count: leads, prev: null as number | null },
    { name: "Agendados", count: agendados, prev: leads },
    { name: "Compareceram", count: compareceram, prev: agendados },
    { name: "Fecharam", count: fecharam, prev: compareceram },
  ]
  const top = Math.max(1, leads)
  const widthOf = (c: number) => Math.max(0.1, c / top) // 0..1, com piso

  // Demais etapas (desfechos) — fora do núcleo do funil.
  const CORE = new Set([
    "Leads",
    "Agendados",
    "Compareceram e Não Fecharam",
    "Compareceram e Fecharam",
  ])
  const outcomes = steps.filter((s) => !CORE.has(s.title) && s.count > 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Funil de conversão */}
      <div className="flex flex-col">
        {levels.map((lvl, i) => {
          const wTop = widthOf(lvl.count) * 100
          const wBot = widthOf(levels[i + 1]?.count ?? lvl.count * 0.55) * 100
          const light = 0.66 - i * 0.07 // escurece conforme afunila
          const fill = `oklch(${light.toFixed(2)} 0.17 255)`
          const clip = `polygon(${(50 - wTop / 2).toFixed(2)}% 0, ${(50 + wTop / 2).toFixed(2)}% 0, ${(50 + wBot / 2).toFixed(2)}% 100%, ${(50 - wBot / 2).toFixed(2)}% 100%)`
          return (
            <div key={lvl.name} className="flex items-stretch gap-3">
              <div className="relative h-14 flex-1">
                <div className="absolute inset-0" style={{ clipPath: clip, background: fill }} />
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center leading-tight text-white"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  <span className="text-[0.7rem] font-medium uppercase tracking-wide opacity-90">
                    {lvl.name}
                  </span>
                  <span className="text-base font-semibold tabular-nums">{fmt(lvl.count)}</span>
                </div>
              </div>
              {/* Conversão a partir do nível anterior */}
              <div className="flex w-28 shrink-0 flex-col justify-center text-xs">
                {lvl.prev === null ? (
                  <span className="text-muted-foreground">topo</span>
                ) : (
                  <>
                    <span className="font-semibold text-primary tabular-nums">
                      {pct(lvl.count, lvl.prev)}
                    </span>
                    <span className="text-muted-foreground">do nível acima</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Demais etapas / desfechos */}
      {outcomes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Para onde foram os leads
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {outcomes.map((o) => (
              <div
                key={o.title}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-[oklch(0.16_0_0)] px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-muted-foreground" title={o.title}>
                  {o.title}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
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
