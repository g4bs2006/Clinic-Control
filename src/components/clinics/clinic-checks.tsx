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

const NO_CATEGORY = "__none__"

export function ClinicChecks({ clinicId, checks }: ClinicChecksProps) {
  const [items, setItems] = useState(checks)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  function toggle(checkItemId: string, current: boolean) {
    if (savingIds.has(checkItemId)) return
    const next = !current

    setSavingIds((prev) => new Set(prev).add(checkItemId))
    setItems((prev) =>
      prev.map((c) => (c.check_item_id === checkItemId ? { ...c, checked: next } : c)),
    )

    startTransition(async () => {
      try {
        const res = await toggleClinicCheck(clinicId, checkItemId, next)
        if (!res.ok) {
          setItems((prev) =>
            prev.map((c) => (c.check_item_id === checkItemId ? { ...c, checked: current } : c)),
          )
          toast.error(res.error)
        }
      } catch {
        setItems((prev) =>
          prev.map((c) => (c.check_item_id === checkItemId ? { ...c, checked: current } : c)),
        )
        toast.error("Erro ao salvar alteração")
      } finally {
        setSavingIds((prev) => {
          const n = new Set(prev)
          n.delete(checkItemId)
          return n
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

  // Agrupa por categoria (ordenada por category_position; sem categoria por último).
  const groupMap = new Map<
    string,
    { key: string; label: string | null; position: number; items: ClinicCheckRow[] }
  >()
  for (const item of items) {
    const key = item.category_id ?? NO_CATEGORY
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        label: item.category_label,
        position: item.category_position ?? Number.MAX_SAFE_INTEGER,
        items: [],
      })
    }
    groupMap.get(key)!.items.push(item)
  }
  const groups = [...groupMap.values()].sort((a, b) => a.position - b.position)
  const showHeaders = groups.length > 1

  function renderItem(item: ClinicCheckRow) {
    return (
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
        {item.is_global && (
          <span className="ml-auto shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-brand">
            fixo
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progresso geral */}
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

      {groups.map((g) => (
        <div key={g.key} className="space-y-1.5">
          {showHeaders && (
            <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{g.label ?? "Sem categoria"}</span>
              <span className="tabular-nums text-muted-foreground/60">
                {g.items.filter((i) => i.checked).length}/{g.items.length}
              </span>
            </div>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2">{g.items.map(renderItem)}</div>
        </div>
      ))}
    </div>
  )
}
