interface FunnelStep {
  title: string
  count: number
}

interface FunnelViewProps {
  steps: FunnelStep[]
}

/**
 * FunnelView — the 9 canonical funnel steps as proportional horizontal bars.
 *
 * Each bar's width is relative to the largest step (usually "Leads"), so the
 * shape reads as a funnel narrowing down to closings. The fill uses the same
 * teal→purple "vital line" gradient that signs the Panel surfaces, so the
 * detail page feels of-a-piece with the rest of the dashboard.
 *
 * Server-compatible — pure presentational, no hooks.
 */
export function FunnelView({ steps }: FunnelViewProps) {
  const max = Math.max(1, ...steps.map((s) => s.count))

  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((step, i) => {
        const pct = (step.count / max) * 100
        // Violet monochrome, fading slightly lighter down the funnel
        const t = steps.length > 1 ? i / (steps.length - 1) : 0
        const light = 0.66 - t * 0.1 // 0.66 → 0.56
        const fill = `oklch(${light.toFixed(2)} 0.19 292)`

        return (
          <div key={step.title} className="flex items-center gap-3">
            <span className="w-44 shrink-0 truncate text-xs text-muted-foreground" title={step.title}>
              {step.title}
            </span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-[oklch(0.225_0_0)]">
              <div
                className="absolute inset-y-0 left-0 rounded-md"
                style={{
                  width: `${Math.max(pct, step.count > 0 ? 4 : 0)}%`,
                  background: fill,
                  transition: "width 0.3s ease",
                }}
              />
              <span
                className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums text-foreground"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
              >
                {step.count.toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
