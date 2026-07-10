"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, X, Eye } from "lucide-react"
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
import { acceptSuggestionAsAcompanhamento } from "@/lib/acompanhamentos/actions"
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

/** Idade (dias) de uma data YYYY-MM-DD — meio-dia BRT evita off-by-one de fuso. */
function daysSinceDay(d: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(`${d}T12:00:00-03:00`).getTime()) / 86_400_000))
}

/** Sugestão pendente envelhece rápido: ou confirma ou descarta. */
function suggestionAgeCls(days: number): string {
  if (days >= 7) return "font-semibold text-rose-400"
  if (days >= 3) return "font-medium text-amber-400"
  return "text-muted-foreground"
}

interface TaskSuggestionsProps {
  suggestions: TaskSuggestionRow[]
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  currentUserId?: string | null
  onChanged: () => void
}

export function TaskSuggestions({ suggestions, clinics, profiles, categories, currentUserId = null, onChanged }: TaskSuggestionsProps) {
  // Responsável padrão da sugestão = dev da clínica; fallback = quem confirma.
  const suggestedAssignee = (clinicId: string | null): string | null =>
    (clinicId ? clinics.find((c) => c.id === clinicId)?.developerId : null) ?? currentUserId ?? null
  const defaultCategory = categories[0]?.slug ?? "outro"
  const [pending, startTransition] = useTransition()
  const [reviewing, setReviewing] = useState<TaskSuggestionRow | null>(null)
  const [category, setCategory] = useState<TaskCategory>(defaultCategory)
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected(new Set())
  }, [suggestions])

  const acoes = suggestions.filter((s) => s.kind !== "acompanhamento")
  const acomps = suggestions.filter((s) => s.kind === "acompanhamento")

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Aceita cada selecionada no destino certo: ação → tarefa; acompanhamento → entidade própria.
  function bulkConfirm() {
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (!chosen.length) return
    startTransition(async () => {
      const results = await Promise.all(
        chosen.map((s) => {
          const assignee = suggestedAssignee(s.clinic_id)
          if (s.kind === "acompanhamento") {
            return acceptSuggestionAsAcompanhamento(s.id, { assignedTo: assignee })
          }
          return acceptTaskSuggestion(s.id, {
            clinicId: s.clinic_id,
            category: defaultCategory,
            priority: PRIORITY_BY_SEVERITY[s.severity] ?? "media",
            assignedTo: assignee,
            dueDate: "",
          })
        }),
      )
      const okCount = results.filter((r) => r.ok).length
      const failCount = results.length - okCount
      if (okCount) toast.success(`${okCount} sugestão(ões) confirmada(s).`)
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
    setCategory(defaultCategory)
    setPriority(PRIORITY_BY_SEVERITY[s.severity] ?? "media")
    setAssignedTo(suggestedAssignee(s.clinic_id))
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

  // Confirma um acompanhamento direto (sem categoria/prioridade — só o responsável padrão).
  function confirmAcompanhamento(s: TaskSuggestionRow) {
    startTransition(async () => {
      const res = await acceptSuggestionAsAcompanhamento(s.id, { assignedTo: suggestedAssignee(s.clinic_id) })
      if (res.ok) {
        toast.success("Acompanhamento criado a partir da sugestão.")
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

  function renderItem(s: TaskSuggestionRow) {
    const isAcomp = s.kind === "acompanhamento"
    return (
      <li key={s.id} className="flex flex-wrap items-start gap-2 py-2">
        <Checkbox
          checked={selected.has(s.id)}
          onCheckedChange={() => toggleSelect(s.id)}
          aria-label={`Selecionar sugestão ${s.text}`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            {s.severity === "alta" && !isAcomp && (
              <span className="mr-1.5 rounded bg-red-500/15 px-1 py-0.5 text-[0.6rem] font-bold uppercase text-red-400">
                Urgente
              </span>
            )}
            {s.text}
          </p>
          {s.description && (
            <p className="mt-0.5 text-xs text-muted-foreground/90 italic">{s.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            <Link href={`/clinicas/${s.clinic_id}`} className="hover:text-foreground transition-colors">
              {s.clinic_name}
            </Link>
            {s.summary_date && (
              <>
                {" "}· {dateLabel(s.summary_date)}
                {daysSinceDay(s.summary_date) >= 3 && (
                  <span className={suggestionAgeCls(daysSinceDay(s.summary_date))}>
                    {" "}· pendente há {daysSinceDay(s.summary_date)}d
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            className="h-9 flex-1 sm:h-8 sm:flex-none"
            onClick={() => (isAcomp ? confirmAcompanhamento(s) : openReview(s))}
          >
            <Check className="size-3.5" />
            Confirmar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            className="h-9 flex-1 sm:h-8 sm:flex-none"
            onClick={() => dismiss(s.id)}
          >
            <X className="size-3.5" />
            Descartar
          </Button>
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-400">
          IA sugere
        </span>
        <p className="text-xs text-muted-foreground">
          Extraído dos resumos diários — confirme para criar ou descarte.
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

      {acoes.length > 0 && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <Check className="size-3" /> Ações sugeridas → viram tarefa
          </p>
          <ul className="flex flex-col divide-y divide-amber-500/15">{acoes.map(renderItem)}</ul>
        </>
      )}

      {acomps.length > 0 && (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <Eye className="size-3" /> Acompanhamentos sugeridos → viram acompanhamento
          </p>
          <ul className="flex flex-col divide-y divide-amber-500/15">{acomps.map(renderItem)}</ul>
        </>
      )}

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
