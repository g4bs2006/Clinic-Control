import { cn } from "@/lib/utils"
import { Panel } from "./panel"

type AccentColor = "teal" | "purple" | "rose"

interface KpiCardProps {
  /** Short descriptor above the value — uppercase, muted, tracking-widest */
  label: string
  /** The headline metric — displayed large and prominent */
  value: string | number
  /** Optional supporting line below the value (e.g. "▲ 12% vs last month") */
  hint?: string
  /**
   * Accent color applied to the value text.
   * "teal"   → --primary (oklch 0.72 0.12 183)
   * "purple" → oklch(0.65 0.18 290)
   * "rose"   → oklch(0.70 0.18 20)
   * Defaults to foreground (no accent).
   */
  accent?: AccentColor
  /** Tailwind classes forwarded to the outer Panel */
  className?: string
}

const accentStyle: Record<AccentColor, React.CSSProperties> = {
  teal: { color: "var(--primary)" }, // violet brand accent
  purple: { color: "oklch(0.70 0.15 230)" }, // blue
  rose: { color: "oklch(0.74 0.15 165)" }, // emerald
}

/**
 * KpiCard — a single key performance indicator inside a dark Panel surface.
 *
 * Design choices:
 * - Label: text-xs uppercase tracking-[0.15em] in muted-foreground — feels like
 *   a precision instrument readout, not a card title.
 * - Value: text-4xl font-semibold tabular-nums with optional teal/purple/rose
 *   accent — the number commands the full visual weight of the card.
 * - Hint: text-xs muted-foreground — fine print, not competing with the value.
 * - Spacing: generous gap between label and value so the number has air.
 *
 * Server-compatible — no hooks, no "use client".
 */
export function KpiCard({
  label,
  value,
  hint,
  accent,
  className,
}: KpiCardProps) {
  return (
    <Panel className={cn("min-w-[160px]", className)}>
      <div className="flex flex-col gap-2">
        {/* Label */}
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>

        {/* Value */}
        <span
          className="text-4xl font-semibold leading-none tabular-nums text-foreground"
          style={accent ? accentStyle[accent] : undefined}
        >
          {value}
        </span>

        {/* Hint */}
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
    </Panel>
  )
}
