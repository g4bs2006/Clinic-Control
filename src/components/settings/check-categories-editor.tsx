"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  upsertCheckCategory,
  deleteCheckCategory,
  type CheckCategoryRow,
} from "@/lib/clinics/check-categories-actions"

interface Draft {
  id?: string
  label: string
  position: number
}

export function CheckCategoriesEditor({ initialCategories }: { initialCategories: CheckCategoryRow[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [drafts, setDrafts] = useState<Draft[]>(
    initialCategories.map((c) => ({ id: c.id, label: c.label, position: c.position })),
  )
  const [pending, startTransition] = useTransition()

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function addRow() {
    const nextPos = drafts.reduce((max, d) => Math.max(max, d.position), 0) + 1
    setDrafts((prev) => [...prev, { label: "", position: nextPos }])
  }

  function save(index: number) {
    const d = drafts[index]
    if (d.label.trim().length < 2) {
      toast.error("O nome precisa ter pelo menos 2 caracteres.")
      return
    }
    startTransition(async () => {
      const res = await upsertCheckCategory({ id: d.id, label: d.label, position: d.position })
      if (res.ok) {
        toast.success("Categoria salva.")
        setDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, id: res.data.id } : item)))
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  async function remove(index: number) {
    const d = drafts[index]
    if (!d.id) {
      setDrafts((prev) => prev.filter((_, i) => i !== index))
      return
    }
    const ok = await confirm({
      title: "Remover categoria?",
      description: `"${d.label}" será removida do checklist.`,
      confirmLabel: "Remover",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteCheckCategory(d.id!)
      if (res.ok) {
        setDrafts((prev) => prev.filter((_, i) => i !== index))
        toast.success("Categoria removida.")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.length === 0 && (
        <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma categoria ainda.</p>
      )}

      {drafts.map((d, i) => (
        <div key={d.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2 sm:border-0 sm:p-0">
          <Input
            value={d.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Ex.: Painéis"
            className="h-8 min-w-40 flex-1"
          />
          <Input
            type="number"
            inputMode="numeric"
            value={d.position}
            onChange={(e) => update(i, { position: Number(e.target.value) || 0 })}
            title="Posição (ordem)"
            className="h-8 w-16 shrink-0 text-right tabular-nums"
          />
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(i)}>
              Salvar
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => remove(i)}>
              Remover
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button type="button" size="sm" variant="ghost" onClick={addRow} disabled={pending}>
          + Adicionar categoria
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Categorias organizam os itens do checklist (ex.: etapas de implantação). Excluir uma
        categoria só solta o vínculo dos itens — os checkboxes não são apagados.
      </p>
    </div>
  )
}
