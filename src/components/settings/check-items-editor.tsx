"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  upsertCheckItem,
  deleteCheckItem,
  type CheckItemRow,
} from "@/lib/clinics/check-items-actions"
import type { CheckCategoryRow } from "@/lib/clinics/check-categories-actions"

const NO_CATEGORY = "__none__"

interface DraftItem {
  id?: string
  label: string
  position: number
  isGlobal: boolean
  categoryId: string | null
}

function toDraft(item: CheckItemRow): DraftItem {
  return {
    id: item.id,
    label: item.label,
    position: item.position,
    isGlobal: item.is_global,
    categoryId: item.category_id,
  }
}

interface CheckItemsEditorProps {
  initialItems: CheckItemRow[]
  categories: CheckCategoryRow[]
  /** Mostra o switch "Fixo" por linha (marca o item como global). Só gestor. */
  canMakeGlobal?: boolean
}

export function CheckItemsEditor({ initialItems, categories, canMakeGlobal = false }: CheckItemsEditorProps) {
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
    setDrafts((prev) => [...prev, { label: "", position: nextPos, isGlobal: false, categoryId: null }])
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
        isGlobal: d.isGlobal,
        categoryId: d.categoryId,
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

  function saveAll() {
    const valid = drafts.map((d, i) => ({ d, i })).filter(({ d }) => d.label.trim().length >= 2)
    if (valid.length === 0) {
      toast.error("Nenhum item com rótulo válido para salvar.")
      return
    }
    startTransition(async () => {
      const results = await Promise.all(
        valid.map(({ d }) =>
          upsertCheckItem({
            id: d.id,
            label: d.label,
            position: d.position,
            isGlobal: d.isGlobal,
            categoryId: d.categoryId,
          }),
        ),
      )
      let ok = 0
      let fail = 0
      const idByIndex = new Map<number, string>()
      valid.forEach(({ i }, k) => {
        const r = results[k]
        if (r.ok) {
          ok++
          if (r.data) idByIndex.set(i, r.data.id)
        } else {
          fail++
        }
      })
      setDrafts((prev) => prev.map((d, idx) => (idByIndex.has(idx) ? { ...d, id: idByIndex.get(idx)! } : d)))

      const skipped = drafts.length - valid.length
      if (ok) toast.success(`${ok} item(ns) salvo(s).`)
      if (fail) toast.error(`${fail} não puderam ser salvos.`)
      if (skipped) toast.warning(`${skipped} sem rótulo válido — ignorado(s).`)
      router.refresh()
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
      {drafts.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhum item de checklist configurado. Clique em &ldquo;Adicionar item&rdquo; para começar.
        </p>
      )}

      {drafts.map((d, i) => (
        <div
          key={d.id ?? `new-${i}`}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2 sm:border-0 sm:p-0"
        >
          <Input
            value={d.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Ex.: Contrato assinado"
            className="h-8 min-w-40 flex-1"
          />
          <Select
            value={d.categoryId ?? NO_CATEGORY}
            items={{
              [NO_CATEGORY]: "Sem categoria",
              ...Object.fromEntries(categories.map((c) => [c.id, c.label])),
            }}
            onValueChange={(v) => update(i, { categoryId: v && v !== NO_CATEGORY ? v : null })}
          >
            <SelectTrigger className="h-8 w-40 shrink-0">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="numeric"
            value={d.position}
            onChange={(e) => update(i, { position: Number(e.target.value) || 0 })}
            title="Posição (ordem)"
            className="h-8 w-16 shrink-0 text-right tabular-nums"
          />
          {canMakeGlobal && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
              <Switch
                checked={d.isGlobal}
                onCheckedChange={(checked) => update(i, { isGlobal: checked === true })}
              />
              Fixo
            </label>
          )}
          <div className="flex shrink-0 justify-end gap-1.5">
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

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={addRow}
          disabled={pending}
        >
          + Adicionar item
        </Button>
        {drafts.length > 0 && (
          <Button type="button" size="sm" onClick={saveAll} disabled={pending}>
            {pending ? "Salvando…" : "Salvar todos"}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Os itens aparecem como checkboxes na página de cada clínica e como resumo na
        listagem.
        {canMakeGlobal && " Marque “Fixo” para que o item apareça em todas as clínicas, para todos os usuários (cada um marca o próprio progresso)."}
      </p>
    </div>
  )
}
