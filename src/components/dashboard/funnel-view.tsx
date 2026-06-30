interface FunnelStep {
  title: string
  count: number
}

interface FunnelViewProps {
  steps: FunnelStep[]
}

/**
 * FunnelView — funil de verdade: cada etapa é um trapézio centralizado cuja
 * largura do topo = sua própria contagem e largura da base = a da etapa
 * seguinte, formando uma silhueta contínua que afunila. Rótulo à esquerda,
 * contagem dentro do trapézio. Tons de azul clareando conforme desce.
 *
 * Server-compatible — pura, sem hooks.
 */
export function FunnelView({ steps }: FunnelViewProps) {
  const max = Math.max(1, ...steps.map((s) => s.count))
  // largura relativa (0..1), com piso para etapas zeradas ainda aparecerem
  const widths = steps.map((s) => Math.max(0.08, s.count / max))

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const wTop = widths[i] * 100
        // base = próxima etapa (afunila); na última, estreita um pouco
        const wBot = (widths[i + 1] ?? widths[i] * 0.55) * 100
        const t = steps.length > 1 ? i / (steps.length - 1) : 0
        const light = 0.6 + t * 0.08 // azul clareando conforme desce
        const fill = `oklch(${light.toFixed(2)} 0.17 255)`
        const clip = `polygon(${(50 - wTop / 2).toFixed(2)}% 0, ${(50 + wTop / 2).toFixed(2)}% 0, ${(50 + wBot / 2).toFixed(2)}% 100%, ${(50 - wBot / 2).toFixed(2)}% 100%)`

        return (
          <div key={step.title} className="flex items-center gap-3">
            <span
              className="w-44 shrink-0 truncate text-right text-xs text-muted-foreground"
              title={step.title}
            >
              {step.title}
            </span>
            <div className="relative h-9 flex-1">
              {/* trapézio */}
              <div
                className="absolute inset-0"
                style={{ clipPath: clip, background: fill }}
              />
              {/* contagem centralizada */}
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
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
