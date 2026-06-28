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
 * Design choices:
 * - bg-card (oklch 0.26 navy): deep, translucent navy. Sits one step above the
 *   page background so panels read as distinct surfaces without hard contrast.
 * - 1px border-border (oklch 0.35 blue-slate): subtle definition, not a box.
 * - Top-edge accent line: a 1px gradient from teal (--primary) to purple — a
 *   "vital line" motif recalling clinical instruments. Unique to these panels.
 * - ring-1 ring-primary/10: faint teal halo to push the panel off the page
 *   (elevation without shadows that muddy dark backgrounds).
 * - rounded-xl + generous padding: premium analytics feel, not a data table.
 *
 * Server-compatible — no hooks, no "use client".
 */
export function Panel({ title, subtitle, className, children }: PanelProps) {
  return (
    <div
      className={cn(
        // Surface
        "relative flex flex-col gap-5 overflow-hidden",
        "rounded-xl border border-border bg-card",
        // Elevation: faint teal ring instead of a drop-shadow (cleaner on dark)
        "ring-1 ring-[var(--primary)]/10",
        // Padding
        "px-6 pb-6 pt-5",
        className
      )}
    >
      {/* Signature: 1px teal→purple accent at top edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, var(--primary) 0%, oklch(0.65 0.18 290) 100%)",
          opacity: 0.7,
        }}
      />

      {(title || subtitle) && (
        <header className="flex flex-col gap-0.5">
          {title && (
            <h3 className="text-sm font-semibold tracking-wide text-foreground">
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
