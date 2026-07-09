"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsiblePanelProps {
  title: string
  subtitle?: string
  /** Aberto por padrão? Default: fechado. */
  defaultOpen?: boolean
  className?: string
  children?: ReactNode
}

/**
 * Variante recolhível do Panel — mesma superfície, com cabeçalho clicável que
 * mostra/esconde o conteúdo. Fechado por padrão para não ocupar rolagem à toa.
 */
export function CollapsiblePanel({
  title,
  subtitle,
  defaultOpen = false,
  className,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card px-5 pb-0 pt-4",
        open && "pb-5",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold tracking-tight text-foreground">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && <div className="mt-5">{children}</div>}
    </div>
  )
}
