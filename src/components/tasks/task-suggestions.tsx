"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
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
      <ul className="flex flex-col divide-y divide-amber-500/15">
        {suggestions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
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
