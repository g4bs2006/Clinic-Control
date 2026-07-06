"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  upsertStatusRule,
  deleteStatusRule,
  type StatusRuleRow,
} from "@/lib/snapshots/rules-actions"

interface DraftRule {
  id?: string
  label: string
  minPct: string // edited as percentage
  maxPct: string
  color: string
  position: number
}

function toDraft(rule: StatusRuleRow): DraftRule {
  return {
    id: rule.id,
    label: rule.label,
    minPct: String(+(rule.rate_min * 100).toFixed(2)),
    maxPct: String(+(rule.rate_max * 100).toFixed(2)),
    color: rule.color,
    position: rule.position,
  }
}

interface StatusRulesEditorProps {
  initialRules: StatusRuleRow[]
}

export function StatusRulesEditor({ initialRules }: StatusRulesEditorProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftRule[]>(initialRules.map(toDraft))
  const [pending, startTransition] = useTransition()

  function update(index: number, patch: Partial<DraftRule>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    )
  }

  function addRow() {
    const nextPos = drafts.reduce((max, d) => Math.max(max, d.position), 0) + 1
    setDrafts((prev) => [
      ...prev,
      { label: "", minPct: "", maxPct: "", color: "#22c55e", position: nextPos },
    ])
  }

  function save(index: number) {
    const d = drafts[index]
    const min = Number(d.minPct)
    const max = Number(d.maxPct)
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      toast.error("Informe taxas numéricas (em %).")
      return
    }
    startTransition(async () => {
      const res = await upsertStatusRule({
        id: d.id,
        label: d.label,
        rate_min: min / 100,
        rate_max: max / 100,
        color: d.color,
        position: d.position,
      })
      if (res.ok) {
        toast.success("Faixa salva.")
        const saved = res.data
        if (saved) {
          setDrafts((prev) =>
            prev.map((item, i) =>
              i === index ? { ...item, id: saved.id } : item
            )
          )
        }
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function remove(index: number) {
    const d = drafts[index]
    if (!d.id) {
      // unsaved row — drop locally
      setDrafts((prev) => prev.filter((_, i) => i !== index))
      return
    }
    startTransition(async () => {
      const res = await deleteStatusRule(d.id!)
      if (res.ok) {
        setDrafts((prev) => prev.filter((_, i) => i !== index))
        toast.success("Faixa removida.")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Column headers */}
      <div className="hidden grid-cols-[1fr_5rem_5rem_3rem_auto] items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
        <span>Rótulo</span>
        <span className="text-right">Mín %</span>
        <span className="text-right">Máx %</span>
        <span className="text-center">Cor</span>
        <span />
      </div>

      {drafts.map((d, i) => (
        <div
          key={d.id ?? `new-${i}`}
          className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_3rem_auto]"
        >
          <Input
            value={d.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Ex.: Ótimo"
            className="h-8"
          />
          <Input
            type="number"
            inputMode="decimal"
            value={d.minPct}
            onChange={(e) => update(i, { minPct: e.target.value })}
            placeholder="0"
            className="h-8 text-right tabular-nums"
          />
          <Input
            type="number"
            inputMode="decimal"
            value={d.maxPct}
            onChange={(e) => update(i, { maxPct: e.target.value })}
            placeholder="100"
            className="h-8 text-right tabular-nums"
          />
          <input
            type="color"
            value={d.color}
            onChange={(e) => update(i, { color: e.target.value })}
            className="h-8 w-full cursor-pointer rounded-md border border-border bg-transparent"
            title={d.color}
            aria-label="Cor da faixa"
          />
          <div className="col-span-2 flex justify-end gap-1.5 sm:col-span-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => save(i)}
            >
              Salvar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => remove(i)}
            >
              Remover
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button type="button" size="sm" variant="ghost" onClick={addRow} disabled={pending}>
          + Adicionar faixa
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        As faixas usam a taxa de conversão (agendados ÷ leads). Uma taxa cai na faixa
        cujo intervalo a contém — mínima inclusiva, máxima exclusiva.
      </p>
    </div>
  )
}
