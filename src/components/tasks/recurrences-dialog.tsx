"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Repeat, Pause, Play, Trash2, Sparkles, Check, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ClinicOption, ProfileOption } from "./task-fields"
import { profileLabel } from "./task-fields"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, type TaskCategory, type TaskPriority } from "@/lib/tasks/categories"
import { freqLabel, type RecurrenceFreq } from "@/lib/tasks/recurrence"
import {
  listRecurrences,
  upsertRecurrence,
  setRecurrenceActive,
  deleteRecurrence,
  type TaskRecurrenceRow,
} from "@/lib/tasks/recurrence-actions"
import {
  listRoutineCandidates,
  dismissRoutine,
  type RoutineCandidateRow,
} from "@/lib/tasks/insights-actions"

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const NONE = "__none__"

type Escopo = "interna" | "clinica" | "todas"

export function RecurrencesDialog({
  clinics,
  profiles,
  categories,
  isGestor,
  onChanged,
}: {
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  isGestor: boolean
  onChanged: () => void
}) {
  const defaultCategory = (categories[0]?.slug ?? "outro") as TaskCategory
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<TaskRecurrenceRow[] | null>(null)
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()

  // form
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<TaskCategory>(defaultCategory)
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [freq, setFreq] = useState<RecurrenceFreq>("semanal")
  const [weekday, setWeekday] = useState(1)
  const [monthday, setMonthday] = useState(1)
  const [escopo, setEscopo] = useState<Escopo>("interna")
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [assignedTo, setAssignedTo] = useState<string | null>(null)

  // detector
  const [candidates, setCandidates] = useState<RoutineCandidateRow[] | null>(null)
  const [detecting, startDetect] = useTransition()

  function load() {
    startTransition(async () => {
      try {
        setRules(await listRecurrences())
      } catch {
        toast.error("Falha ao carregar as regras.")
      }
    })
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (v && rules === null) load()
  }

  function resetForm() {
    setTitle("")
    setCategory(defaultCategory)
    setPriority("media")
    setFreq("semanal")
    setWeekday(1)
    setMonthday(1)
    setEscopo("interna")
    setClinicId(null)
    setAssignedTo(null)
  }

  function save() {
    startTransition(async () => {
      const res = await upsertRecurrence({
        title,
        category,
        priority,
        freq,
        weekday: freq === "semanal" ? weekday : null,
        monthday: freq === "mensal" ? monthday : null,
        clinicId: escopo === "clinica" ? clinicId : null,
        allClinics: escopo === "todas",
        assignedTo: escopo === "todas" ? null : assignedTo,
      })
      if (res.ok) {
        toast.success("Regra criada — as ocorrências nascem na abertura do dia.")
        setShowForm(false)
        resetForm()
        load()
        onChanged()
      } else {
        toast.error(res.error)
      }
    })
  }

  function toggleActive(r: TaskRecurrenceRow) {
    startTransition(async () => {
      const res = await setRecurrenceActive(r.id, !r.active)
      if (res.ok) {
        toast.success(r.active ? "Regra pausada" : "Regra ativada")
        load()
      } else toast.error(res.error)
    })
  }

  async function remove(r: TaskRecurrenceRow) {
    const ok = await confirm({
      title: "Excluir regra recorrente?",
      description: `"${r.title}" deixa de gerar novas ocorrências. As tarefas já criadas ficam.`,
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteRecurrence(r.id)
      if (res.ok) {
        toast.success("Regra excluída.")
        load()
      } else toast.error(res.error)
    })
  }

  function detect() {
    startDetect(async () => {
      const res = await listRoutineCandidates()
      if (res.ok) {
        setCandidates(res.candidates)
        if (res.candidates.length === 0) toast.info("Nenhuma rotina nova detectada no histórico recente.")
      } else toast.error(res.error)
    })
  }

  function useCandidate(c: RoutineCandidateRow) {
    setTitle(c.title)
    setFreq(c.cadence.freq)
    if (c.clinicId) {
      setEscopo("clinica")
      setClinicId(c.clinicId)
    } else {
      setEscopo("interna")
    }
    setShowForm(true)
  }

  function ignoreCandidate(c: RoutineCandidateRow) {
    startTransition(async () => {
      const res = await dismissRoutine(c.signature)
      if (res.ok) setCandidates((prev) => prev?.filter((x) => x.signature !== c.signature) ?? null)
      else toast.error(res.error)
    })
  }

  function escopoLabel(r: TaskRecurrenceRow): string {
    if (r.all_clinics) return "Todas as clínicas · dev da carteira"
    if (r.clinic_name) return r.clinic_name
    return "Interna"
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={buttonVariants({ size: "sm", variant: "outline" })}>
        <Repeat className="size-3.5" />
        Recorrentes
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tarefas recorrentes</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* ── Regras ── */}
          {rules === null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : rules.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nenhuma regra ainda. Crie a primeira — as ocorrências nascem sozinhas na data, sem empilhar duplicatas.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {rules.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 py-2.5 ${r.active ? "" : "opacity-60"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                      <span>{freqLabel({ freq: r.freq, weekday: r.weekday, monthday: r.monthday })}</span>
                      · <span>{escopoLabel(r)}</span>
                      {!r.all_clinics && r.assigned_to_name && <>· {r.assigned_to_name}</>}
                      {!r.active && <span className="text-amber-400">· pausada</span>}
                    </p>
                  </div>
                  <Button
                    type="button" size="icon-sm" variant="ghost" disabled={pending}
                    title={r.active ? "Pausar" : "Reativar"}
                    className="size-9 sm:size-8"
                    onClick={() => toggleActive(r)}
                  >
                    {r.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </Button>
                  <Button
                    type="button" size="icon-sm" variant="ghost" disabled={pending}
                    title="Excluir regra"
                    className="size-9 text-muted-foreground hover:text-red-400 sm:size-8"
                    onClick={() => remove(r)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Nova regra ── */}
          {showForm ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Conferir painel da clínica"
                className="h-9"
                autoFocus
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Categoria
                  <Select value={category} items={Object.fromEntries(categories.map((c) => [c.slug, c.label]))} onValueChange={(v) => v && setCategory(v as TaskCategory)}>
                    <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Prioridade
                  <Select value={priority} items={Object.fromEntries(TASK_PRIORITIES.map((p) => [p, TASK_PRIORITY_LABEL[p]]))} onValueChange={(v) => v && setPriority(v as TaskPriority)}>
                    <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Frequência
                  <Select value={freq} items={{ diaria: "Diária", semanal: "Semanal", mensal: "Mensal" }} onValueChange={(v) => v && setFreq(v as RecurrenceFreq)}>
                    <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diária</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {freq === "semanal" && (
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Dia da semana
                    <Select value={String(weekday)} items={Object.fromEntries(WEEKDAYS.map((d, i) => [String(i), d]))} onValueChange={(v) => v && setWeekday(Number(v))}>
                      <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                )}
                {freq === "mensal" && (
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Dia do mês
                    <Input
                      type="number" min={1} max={31} value={monthday}
                      onChange={(e) => setMonthday(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                      className="h-9 sm:h-8"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Escopo
                  <Select
                    value={escopo}
                    items={{ interna: "Interna (sem clínica)", clinica: "Uma clínica", todas: "Todas as clínicas ativas" }}
                    onValueChange={(v) => v && setEscopo(v as Escopo)}
                  >
                    <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interna">Interna (sem clínica)</SelectItem>
                      <SelectItem value="clinica">Uma clínica</SelectItem>
                      {isGestor && <SelectItem value="todas">Todas as clínicas ativas</SelectItem>}
                    </SelectContent>
                  </Select>
                </label>
                {escopo === "clinica" && (
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Clínica
                    <Select
                      value={clinicId ?? NONE}
                      items={{ [NONE]: "Selecione…", ...Object.fromEntries(clinics.map((c) => [c.id, c.name])) }}
                      onValueChange={(v) => setClinicId(v && v !== NONE ? v : null)}
                    >
                      <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {clinics.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                )}
                {escopo !== "todas" && (
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Responsável
                    <Select
                      value={assignedTo ?? NONE}
                      items={{ [NONE]: "Sem responsável", ...Object.fromEntries(profiles.map((p) => [p.id, profileLabel(p)])) }}
                      onValueChange={(v) => setAssignedTo(v && v !== NONE ? v : null)}
                    >
                      <SelectTrigger className="h-9 sm:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem responsável</SelectItem>
                        {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{profileLabel(p)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                )}
              </div>
              {escopo === "todas" && (
                <p className="text-[0.7rem] text-muted-foreground">
                  Uma tarefa por clínica ativa, atribuída ao dev da carteira de cada uma. Clínica nova entra sozinha; arquivada sai.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="button" size="sm" disabled={pending || title.trim().length < 3 || (escopo === "clinica" && !clinicId)} onClick={save}>
                  Criar regra
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(true)}>
                + Nova regra
              </Button>
            </div>
          )}

          {/* ── Detector de rotinas (Fase 2, lente 1) ── */}
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-amber-400" />
                Rotinas detectadas no histórico — confirme para virar regra.
              </p>
              <Button type="button" size="sm" variant="outline" disabled={detecting} onClick={detect}>
                {detecting ? "Analisando…" : "Detectar rotinas"}
              </Button>
            </div>
            {candidates !== null && candidates.length > 0 && (
              <ul className="flex flex-col divide-y divide-amber-500/15">
                {candidates.map((c) => (
                  <li key={c.signature} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.clinicName ?? "Interna"} · {c.cadence.occurrences}× a cada ~{c.cadence.medianGapDays} dia
                        {c.cadence.medianGapDays !== 1 ? "s" : ""} · sugere {c.cadence.freq}
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button type="button" size="sm" variant="outline" className="h-9 flex-1 sm:h-8 sm:flex-none" disabled={pending} onClick={() => useCandidate(c)}>
                        <Check className="size-3.5" />
                        Criar regra
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-9 flex-1 sm:h-8 sm:flex-none" disabled={pending} onClick={() => ignoreCandidate(c)}>
                        <X className="size-3.5" />
                        Ignorar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
