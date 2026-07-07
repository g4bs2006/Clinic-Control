"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  upsertTaskCategory,
  deleteTaskCategory,
  type TaskCategoryRow,
} from "@/lib/tasks/category-actions"

interface DraftCategory {
  id?: string
  slug: string
  label: string
  position: number
  active: boolean
}

function toDraft(row: TaskCategoryRow): DraftCategory {
  return { id: row.id, slug: row.slug, label: row.label, position: row.position, active: row.active }
}

interface TaskCategoriesEditorProps {
  initialCategories: TaskCategoryRow[]
}

export function TaskCategoriesEditor({ initialCategories }: TaskCategoriesEditorProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftCategory[]>(initialCategories.map(toDraft))
  const [pending, startTransition] = useTransition()

  function update(index: number, patch: Partial<DraftCategory>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function addRow() {
    const nextPos = drafts.reduce((max, d) => Math.max(max, d.position), 0) + 1
    setDrafts((prev) => [...prev, { slug: "", label: "", position: nextPos, active: true }])
  }

  function save(index: number) {
    const d = drafts[index]
    startTransition(async () => {
      const res = await upsertTaskCategory(d)
      if (res.ok) {
        toast.success("Categoria salva.")
        setDrafts((prev) => prev.map((item, i) => (i === index ? toDraft(res.data) : item)))
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function toggleActive(index: number) {
    const d = drafts[index]
    if (!d.id) {
      update(index, { active: !d.active })
      return
    }
    startTransition(async () => {
      const res = await upsertTaskCategory({ ...d, active: !d.active })
      if (res.ok) {
        toast.success(res.data.active ? "Categoria reativada." : "Categoria desativada.")
        setDrafts((prev) => prev.map((item, i) => (i === index ? toDraft(res.data) : item)))
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function remove(index: number) {
    const d = drafts[index]
    if (!d.id) {
      setDrafts((prev) => prev.filter((_, i) => i !== index))
      return
    }
    startTransition(async () => {
      const res = await deleteTaskCategory(d.id!)
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
      <div className="hidden grid-cols-[1fr_1fr_5rem_auto] items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
        <span>Identificador</span>
        <span>Rótulo</span>
        <span className="text-center">Ativa</span>
        <span />
      </div>

      {drafts.map((d, i) => (
        <div
          key={d.id ?? `new-${i}`}
          className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_1fr_5rem_auto]"
        >
          <Input
            value={d.slug}
            onChange={(e) => update(i, { slug: e.target.value.toLowerCase() })}
            placeholder="ex.: financeiro"
            className="h-8 font-mono text-xs"
            disabled={!!d.id}
            title={d.id ? "Identificador não pode ser alterado após criado" : undefined}
          />
          <Input
            value={d.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Ex.: Financeiro"
            className="h-8"
          />
          <div className="flex justify-center">
            <Switch checked={d.active} disabled={pending} onCheckedChange={() => toggleActive(i)} />
          </div>
          <div className="col-span-2 flex justify-end gap-1.5 sm:col-span-1">
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
        Desative uma categoria para tirá-la dos formulários sem afetar as tarefas que já a usam.
        Remover só é permitido se nenhuma tarefa estiver usando a categoria.
      </p>
    </div>
  )
}
