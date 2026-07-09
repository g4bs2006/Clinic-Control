import { cn } from "@/lib/utils"
import type { HealthBand, HealthConfidence } from "@/lib/health/score"

const BAND_STYLE: Record<HealthBand, string> = {
  saudavel: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  atencao: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  risco: "bg-red-500/15 text-red-400 border-red-500/25",
}

const BAND_LABEL: Record<HealthBand, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  risco: "Risco",
}

const CONF_LABEL: Record<HealthConfidence, string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
}

/**
 * Selo de health score: número + banda (cor). `score=null` → estado "sem dados"
 * (cobertura insuficiente). A confiança vira um ponto discreto com title.
 */
export function HealthBadge({
  score,
  band,
  confidence,
  showLabel = true,
}: {
  score: number | null
  band: HealthBand | null
  confidence: HealthConfidence | null
  showLabel?: boolean
}) {
  if (score === null || band === null) {
    return (
      <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
        s/ dados
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
        BAND_STYLE[band],
      )}
      title={confidence ? CONF_LABEL[confidence] : undefined}
    >
      {score}
      {showLabel && <span className="font-medium opacity-80">· {BAND_LABEL[band]}</span>}
      {confidence === "baixa" && <span className="size-1 rounded-full bg-current opacity-60" />}
    </span>
  )
}
