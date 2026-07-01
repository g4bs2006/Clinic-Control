"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  toggleClinicCheck,
  type ClinicCheckRow,
} from "@/lib/clinics/check-items-actions"

interface ClinicChecksProps {
  clinicId: string
  checks: ClinicCheckRow[]
}

export function ClinicChecks({ clinicId, checks }: ClinicChecksProps) {
  const [items, setItems] = useState(checks)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  function toggle(checkItemId: string, current: boolean) {
    if (savingIds.has(checkItemId)) return

    const next = !current

    // Add to saving
    setSavingIds((prev) => {
      const nextSet = new Set(prev)
      nextSet.add(checkItemId)
      return nextSet
    })

    // Optimistic update
    setItems((prev) =>
      prev.map((c) =>
        c.check_item_id === checkItemId ? { ...c, checked: next } : c,
      ),
    )

    startTransition(async () => {
      try {
        const res = await toggleClinicCheck(clinicId, checkItemId, next)
        if (!res.ok) {
          // Revert on error
          setItems((prev) =>
            prev.map((c) =>
              c.check_item_id === checkItemId ? { ...c, checked: current } : c,
            ),
          )
          toast.error(res.error)
        }
      } catch {
        // Revert on error
        setItems((prev) =>
          prev.map((c) =>
            c.check_item_id === checkItemId ? { ...c, checked: current } : c,
          ),
        )
        toast.error("Erro ao salvar alteração")
      } finally {
        // Remove from saving
        setSavingIds((prev) => {
          const nextSet = new Set(prev)
          nextSet.delete(checkItemId)
          return nextSet
        })
      }
    })
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhum item de checklist configurado.{" "}
        <a href="/configuracoes" className="text-primary hover:underline">
          Configurar →
        </a>
      </p>
    )
  }

  const checkedCount = items.filter((c) => c.checked).length

  return (
    <div className="flex flex-col gap-3">
      {/* Progress summary */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(checkedCount / items.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {checkedCount}/{items.length}
        </span>
      </div>

      {/* Check items */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.check_item_id}
            type="button"
            disabled={savingIds.has(item.check_item_id)}
            onClick={() => toggle(item.check_item_id, item.checked)}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150",
              item.checked
                ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
                : "border-border/60 bg-card hover:border-border hover:bg-accent/40 text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md border transition-all duration-150",
                item.checked
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted-foreground/40 group-hover:border-muted-foreground/70",
              )}
            >
              {item.checked && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
