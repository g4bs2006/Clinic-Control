import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface PanelProps {
  /** Optional panel title rendered above children */
  title?: string
  /** Optional subtitle / description under the title */
  subtitle?: string
  /** Tailwind classes appended to the outer wrapper */
  className?: string
  children?: ReactNode
}

/**
 * Panel — reusable dark surface for dashboard sections.
 *
 * Vercel-leaning: a flat near-black card defined by a single hairline border —
 * no glow, no gradient. Restraint is the point; color belongs to the data.
 *
 * Server-compatible — no hooks, no "use client".
 */
export function Panel({ title, subtitle, className, children }: PanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 rounded-lg border border-border bg-card px-5 pb-5 pt-4",
        className
      )}
    >
      {(title || subtitle) && (
        <header className="flex flex-col gap-0.5">
          {title && (
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </header>
      )}

      {children}
    </div>
  )
}
