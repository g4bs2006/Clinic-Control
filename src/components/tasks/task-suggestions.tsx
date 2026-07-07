"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { TaskFields, type ClinicOption, type ProfileOption } from "./task-fields"
import { acceptTaskSuggestion, dismissTaskSuggestion, type TaskSuggestionRow } from "@/lib/tasks/actions"
import type { TaskCategory, TaskPriority } from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

const PRIORITY_BY_SEVERITY: Record<TaskSuggestionRow["severity"], TaskPriority> = {
  baixa: "baixa",
  media: "media",
  alta: "urgente",
}

function dateLabel(d: string): string {
  if (!d) return ""
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

interface TaskSuggestionsProps {
  suggestions: TaskSuggestionRow[]
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  onChanged: () => void
}

export function TaskSuggestions({ suggestions, clinics, profiles, categories, onChanged }: TaskSuggestionsProps) {
  const defaultCategory = categories[0]?.slug ?? "outro"
  const [pending, startTransition] = useTransition()
  const [reviewing, setReviewing] = useState<TaskSuggestionRow | null>(null)
  const [category, setCategory] = useState<TaskCategory>(defaultCategory)
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState("")
  // Seleção múltipla (ação em lote). Limpa quando a lista muda (após confirmar/descartar).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected(new Set())
  }, [suggestions])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function bulkConfirm() {
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (!chosen.length) return
    startTransition(async () => {
      const results = await Promise.all(
        chosen.map((s) => {
          const clinic = clinics.find((c) => c.id === s.clinic_id)
          return acceptTaskSuggestion(s.id, {
            clinicId: s.clinic_id,
            category: defaultCategory,
            priority: PRIORITY_BY_SEVERITY[s.severity] ?? "media",
            assignedTo: clinic?.developerId ?? null,
            dueDate: "",
          })
        }),
      )
      const okCount = results.filter((r) => r.ok).length
      const failCount = results.length - okCount
      if (okCount) toast.success(`${okCount} tarefa(s) criada(s) a partir das sugestões.`)
      if (failCount) toast.error(`${failCount} sugestão(ões) não puderam ser confirmadas.`)
      setSelected(new Set())
      onChanged()
    })
  }

  function bulkDismiss() {
    const ids = [...selected]
    if (!ids.length) return
    startTransition(async () => {
      const results = await Promise.all(ids.map((id) => dismissTaskSuggestion(id)))
      const okCount = results.filter((r) => r.ok).length
      if (okCount) toast.success(`${okCount} sugestão(ões) descartada(s).`)
      setSelected(new Set())
      onChanged()
    })
  }

  function openReview(s: TaskSuggestionRow) {
    const clinic = clinics.find((c) => c.id === s.clinic_id)
    setCategory(defaultCategory)
    setPriority(PRIORITY_BY_SEVERITY[s.severity] ?? "media")
    setAssignedTo(clinic?.developerId ?? null)
    setDueDate("")
    setReviewing(s)
  }

  function accept() {
    if (!reviewing) return
    startTransition(async () => {
      const res = await acceptTaskSuggestion(reviewing.id, {
        clinicId: reviewing.clinic_id,
        category,
        priority,
        assignedTo,
        dueDate,
      })
      if (res.ok) {
        toast.success("Tarefa criada a partir da sugestão.")
        setReviewing(null)
        onChanged()
      } else {
        toast.error(res.error)
      }
    })
  }

  function dismiss(id: string) {
    startTransition(async () => {
      const res = await dismissTaskSuggestion(id)
      if (res.ok) onChanged()
      else toast.error(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-400">
          IA sugere
        </span>
        <p className="text-xs text-muted-foreground">
          Pendências identificadas nos resumos diários — confirme para virar tarefa ou descarte.
        </p>
      </div>

      {/* Cabeçalho de seleção + ação em lote */}
      <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/15 pb-2">
        <Checkbox
          checked={suggestions.length > 0 && suggestions.every((s) => selected.has(s.id))}
          onCheckedChange={(checked) =>
            setSelected(checked ? new Set(suggestions.map((s) => s.id)) : new Set())
          }
          aria-label="Selecionar todas as sugestões"
        />
        {selected.size > 0 ? (
          <>
            <span className="text-xs font-medium text-muted-foreground">
              {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
            </span>
            <div className="flex-1" />
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={bulkConfirm}>
              <Check className="size-3.5" />
              Confirmar ({selected.size})
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={bulkDismiss}>
              <X className="size-3.5" />
              Descartar ({selected.size})
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Selecione para confirmar ou descartar em lote</span>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-amber-500/15">
        {suggestions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
            <Checkbox
              checked={selected.has(s.id)}
              onCheckedChange={() => toggleSelect(s.id)}
              aria-label={`Selecionar sugestão ${s.text}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {s.severity === "alta" && (
                  <span className="mr-1.5 rounded bg-red-500/15 px-1 py-0.5 text-[0.6rem] font-bold uppercase text-red-400">
                    Urgente
                  </span>
                )}
                {s.text}
              </p>
              <p className="text-xs text-muted-foreground">
                <Link href={`/clinicas/${s.clinic_id}`} className="hover:text-foreground transition-colors">
                  {s.clinic_name}
                </Link>
                {s.summary_date && <> · {dateLabel(s.summary_date)}</>}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => openReview(s)}
              >
                <Check className="size-3.5" />
                Confirmar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => dismiss(s.id)}
              >
                <X className="size-3.5" />
                Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={reviewing != null} onOpenChange={(v) => !v && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar tarefa</DialogTitle>
            <DialogDescription>{reviewing?.text}</DialogDescription>
          </DialogHeader>
          <TaskFields
            clinics={clinics}
            profiles={profiles}
            categories={categories}
            clinicId={reviewing?.clinic_id ?? null}
            onClinicIdChange={() => {}}
            lockClinic
            category={category}
            onCategoryChange={setCategory}
            priority={priority}
            onPriorityChange={setPriority}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            dueDate={dueDate}
            onDueDateChange={setDueDate}
          />
          <DialogFooter>
            <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
            <Button type="button" disabled={pending} onClick={accept}>
              Criar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
