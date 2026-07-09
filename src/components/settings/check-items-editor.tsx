"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  upsertCheckItem,
  deleteCheckItem,
  type CheckItemRow,
} from "@/lib/clinics/check-items-actions"

interface DraftItem {
  id?: string
  label: string
  position: number
}

function toDraft(item: CheckItemRow): DraftItem {
  return { id: item.id, label: item.label, position: item.position }
}

interface CheckItemsEditorProps {
  initialItems: CheckItemRow[]
  /** Quando true, os itens criados/editados aqui são fixos (globais). */
  isGlobal?: boolean
}

export function CheckItemsEditor({ initialItems, isGlobal = false }: CheckItemsEditorProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftItem[]>(initialItems.map(toDraft))
  const [pending, startTransition] = useTransition()

  function update(index: number, patch: Partial<DraftItem>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    )
  }

  function addRow() {
    const nextPos = drafts.reduce((max, d) => Math.max(max, d.position), 0) + 1
    setDrafts((prev) => [...prev, { label: "", position: nextPos }])
  }

  function save(index: number) {
    const d = drafts[index]
    if (d.label.trim().length < 2) {
      toast.error("O rótulo precisa ter pelo menos 2 caracteres.")
      return
    }
    startTransition(async () => {
      const res = await upsertCheckItem({
        id: d.id,
        label: d.label,
        position: d.position,
        isGlobal,
      })
      if (res.ok) {
        toast.success("Item salvo.")
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
      const res = await deleteCheckItem(d.id!)
      if (res.ok) {
        setDrafts((prev) => prev.filter((_, i) => i !== index))
        toast.success("Item removido.")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Column headers */}
      <div className="hidden grid-cols-[1fr_4rem_auto] items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
        <span>Rótulo</span>
        <span className="text-right">Posição</span>
        <span />
      </div>

      {drafts.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhum item de checklist configurado. Clique em &ldquo;Adicionar item&rdquo; para começar.
        </p>
      )}

      {drafts.map((d, i) => (
        <div
          key={d.id ?? `new-${i}`}
          className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_4rem_auto]"
        >
          <Input
            value={d.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Ex.: Contrato assinado"
            className="h-8"
          />
          <Input
            type="number"
            inputMode="numeric"
            value={d.position}
            onChange={(e) =>
              update(i, { position: Number(e.target.value) || 0 })
            }
            className="hidden h-8 w-full text-right tabular-nums sm:block"
          />
          <div className="flex justify-end gap-1.5">
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={addRow}
          disabled={pending}
        >
          + Adicionar item
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Os itens definidos aqui aparecem como checkboxes na página de cada clínica
        e como resumo visual na listagem.
      </p>
    </div>
  )
}
