"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  Repeat,
  Users,
  Building2,
  Paperclip,
  MessageSquare,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskRow } from "@/lib/tasks/actions"
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, type TaskPriority } from "@/lib/tasks/categories"
import { spDateParts, agendaBucket } from "@/lib/tasks/agenda"
import { freqLabel } from "@/lib/tasks/recurrence"
import { listRecurrences, type TaskRecurrenceRow } from "@/lib/tasks/recurrence-actions"
import { getTaskCounts, type TaskCounts } from "@/lib/tasks/dashboard-actions"

const OPEN = new Set<string>(["pendente", "em_andamento"])

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgente: "bg-red-500",
  alta: "bg-orange-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-400",
}
const PRIORITY_BAR: Record<TaskPriority, string> = {
  urgente: "bg-red-500",
  alta: "bg-orange-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-500",
}

type Profile = { id: string; name: string | null; email?: string | null }
type ClinicOpt = { id: string; name: string; developerId?: string | null }

interface TaskDashboardProps {
  tasks: TaskRow[]
  categoryLabel: Record<string, string>
  profiles: Profile[]
  clinics: ClinicOpt[]
  isGestor: boolean
  currentUserId: string | null
  onOpenTask: (id: string) => void
}

function daysBetween(fromIso: string, toIsoDate: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime()
  const b = new Date(`${toIsoDate}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

// ── Blocos visuais reutilizáveis ─────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <Icon className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <span className="ml-auto text-[0.65rem] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

// Barra horizontal rotulada (distribuição / carga / envelhecimento).
function BarRow({
  label,
  value,
  max,
  barClass,
  suffix,
}: {
  label: React.ReactNode
  value: number
  max: number
  barClass?: string
  suffix?: React.ReactNode
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 truncate text-muted-foreground" title={typeof label === "string" ? label : undefined}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div className={cn("h-full rounded-full", barClass ?? "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right tabular-nums text-foreground">
        {value}
        {suffix}
      </span>
    </div>
  )
}

export function TaskDashboard({
  tasks,
  categoryLabel,
  profiles,
  clinics,
  isGestor,
  currentUserId,
  onOpenTask,
}: TaskDashboardProps) {
  const { today, endOfWeek } = useMemo(() => spDateParts(new Date()), [])

  const profileName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of profiles) m.set(p.id, p.name ?? "—")
    return m
  }, [profiles])

  const snoozeActive = (t: TaskRow) => !!t.snoozed_until && t.snoozed_until.slice(0, 10) > today

  // ── Agregações a partir das tarefas já em memória (escopadas por carteira) ──
  const d = useMemo(() => {
    const open = tasks.filter((t) => OPEN.has(t.status))
    const actionable = open.filter((t) => !snoozeActive(t)) // fora as adiadas
    const bucketOf = (t: TaskRow) => agendaBucket(t.due_date, today, endOfWeek)

    const overdue = actionable
      .filter((t) => bucketOf(t) === "atrasada")
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    const dueToday = actionable.filter((t) => bucketOf(t) === "hoje")
    const dueWeek = actionable.filter((t) => bucketOf(t) === "semana")

    const completedRecent = tasks.filter(
      (t) => t.status === "concluida" && t.completed_at && daysBetween(t.completed_at, today) <= 7,
    )

    // Distribuição por prioridade / categoria (só abertas acionáveis).
    const byPriority = new Map<TaskPriority, number>()
    for (const p of TASK_PRIORITIES) byPriority.set(p, 0)
    const byCategory = new Map<string, number>()
    for (const t of actionable) {
      byPriority.set(t.priority, (byPriority.get(t.priority) ?? 0) + 1)
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1)
    }

    // Carga por responsável (abertas + atrasadas).
    const overdueIds = new Set(overdue.map((t) => t.id))
    const byAssignee = new Map<string, { open: number; overdue: number }>()
    for (const t of open) {
      const key = t.assigned_to ?? "__none__"
      const cur = byAssignee.get(key) ?? { open: 0, overdue: 0 }
      cur.open++
      if (overdueIds.has(t.id)) cur.overdue++
      byAssignee.set(key, cur)
    }

    // Por clínica.
    const byClinic = new Map<string, { name: string; open: number; overdue: number }>()
    for (const t of open) {
      const key = t.clinic_id ?? "__none__"
      const cur = byClinic.get(key) ?? { name: t.clinic_name ?? "Sem clínica", open: 0, overdue: 0 }
      cur.open++
      if (overdueIds.has(t.id)) cur.overdue++
      byClinic.set(key, cur)
    }

    // Envelhecimento das abertas (desde a criação).
    const aging = { "0-3": 0, "4-7": 0, "8-14": 0, "15+": 0 }
    for (const t of open) {
      const age = daysBetween(t.created_at, today)
      if (age <= 3) aging["0-3"]++
      else if (age <= 7) aging["4-7"]++
      else if (age <= 14) aging["8-14"]++
      else aging["15+"]++
    }

    // Ritmo: criadas × concluídas por dia (últimos 14 dias).
    const DAYS = 14
    const series: { day: string; created: number; completed: number }[] = []
    for (let i = DAYS - 1; i >= 0; i--) {
      const dt = new Date(`${today}T00:00:00Z`)
      dt.setUTCDate(dt.getUTCDate() - i)
      series.push({ day: dt.toISOString().slice(0, 10), created: 0, completed: 0 })
    }
    const idx = new Map(series.map((s, i) => [s.day, i]))
    for (const t of tasks) {
      const c = t.created_at.slice(0, 10)
      if (idx.has(c)) series[idx.get(c)!].created++
      if (t.status === "concluida" && t.completed_at) {
        const cc = t.completed_at.slice(0, 10)
        if (idx.has(cc)) series[idx.get(cc)!].completed++
      }
    }

    // Recorrentes atrasadas (ocorrências abertas que furaram o prazo).
    const recurringOverdue = overdue.filter((t) => t.recurrence_id)

    // Concluídas em foco (recentes, não arquivadas).
    const completed = tasks
      .filter((t) => t.status === "concluida")
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at))
      .slice(0, 15)

    return {
      openCount: open.length,
      snoozedCount: open.filter(snoozeActive).length,
      overdue,
      dueToday,
      dueWeek,
      completedRecent,
      byPriority,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      byAssignee: [...byAssignee.entries()].sort((a, b) => b[1].open - a[1].open),
      byClinic: [...byClinic.values()].sort((a, b) => b.open - a.open),
      aging,
      series,
      recurringOverdue,
      completed,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today, endOfWeek])

  // ── Recorrências (lazy) ────────────────────────────────────────────────────
  const [recurrences, setRecurrences] = useState<TaskRecurrenceRow[] | null>(null)
  useEffect(() => {
    let cancelled = false
    listRecurrences()
      .then((rows) => {
        if (cancelled) return
        // Dev vê só as recorrências relevantes à carteira dele.
        const myClinics = new Set(
          clinics.filter((c) => !c.developerId || c.developerId === currentUserId).map((c) => c.id),
        )
        const scoped = isGestor
          ? rows
          : rows.filter(
              (r) =>
                r.all_clinics ||
                r.assigned_to === currentUserId ||
                (r.clinic_id && myClinics.has(r.clinic_id)),
            )
        setRecurrences(scoped)
      })
      .catch(() => setRecurrences([]))
    return () => {
      cancelled = true
    }
  }, [clinics, currentUserId, isGestor])

  const activeRecurrences = (recurrences ?? []).filter((r) => r.active)

  // ── Contagens de anexos/comentários das concluídas (lazy) ───────────────────
  const [counts, setCounts] = useState<Record<string, TaskCounts>>({})
  useEffect(() => {
    const ids = d.completed.map((t) => t.id)
    if (ids.length === 0) return
    let cancelled = false
    getTaskCounts(ids)
      .then((res) => {
        if (!cancelled) setCounts(res)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [d.completed])

  const maxSeries = Math.max(1, ...d.series.map((s) => Math.max(s.created, s.completed)))
  const priorityMax = Math.max(1, ...[...d.byPriority.values()])
  const categoryMax = Math.max(1, ...d.byCategory.map(([, v]) => v))
  const assigneeMax = Math.max(1, ...d.byAssignee.map(([, v]) => v.open))
  const clinicMax = Math.max(1, ...d.byClinic.map((v) => v.open))
  const agingMax = Math.max(1, ...Object.values(d.aging))

  const kpis = [
    { label: "Atrasadas", value: d.overdue.length, icon: AlertTriangle, tone: "text-red-400" },
    { label: "Hoje", value: d.dueToday.length, icon: CalendarClock, tone: "text-amber-400" },
    { label: "Esta semana", value: d.dueWeek.length, icon: CalendarDays, tone: "text-sky-400" },
    { label: "Abertas", value: d.openCount, icon: ListChecks, tone: "text-foreground" },
    { label: "Concluídas 7d", value: d.completedRecent.length, icon: CheckCircle2, tone: "text-emerald-400" },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* A. Termômetro */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card px-3 py-3">
            <div className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <k.icon className={cn("size-3.5", k.tone)} />
              {k.label}
            </div>
            <div className={cn("mt-1 text-2xl font-bold tabular-nums", k.tone)}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* B. Atrasadas em foco */}
        <Section title="Atrasadas em foco" icon={AlertTriangle} hint={`${d.overdue.length} no total`}>
          {d.overdue.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nada atrasado — tudo em dia. 🎉</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {d.overdue.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t.id)}
                    className="flex w-full items-center gap-2 py-2 text-left hover:opacity-80"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{t.title}</span>
                      <span className="block truncate text-[0.68rem] text-muted-foreground">
                        {t.clinic_name ?? "Sem clínica"}
                        {t.assigned_to && ` · ${profileName.get(t.assigned_to) ?? "—"}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[0.68rem] font-medium tabular-nums text-red-400">
                      {t.due_date ? `${daysBetween(t.due_date, today)}d` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* C. Recorrentes */}
        <Section
          title="Recorrentes"
          icon={Repeat}
          hint={recurrences === null ? "carregando…" : `${activeRecurrences.length} ativa(s)`}
        >
          {d.recurringOverdue.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {d.recurringOverdue.length} ocorrência(s) recorrente(s) atrasada(s) — a rotina está furando.
            </div>
          )}
          {recurrences === null ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Carregando recorrências…</p>
          ) : activeRecurrences.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Nenhuma regra recorrente ativa.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {activeRecurrences.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2 text-xs">
                  <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{r.title}</span>
                    <span className="block truncate text-[0.68rem] text-muted-foreground">
                      {r.all_clinics ? "Todas as clínicas" : r.clinic_name ?? "Sem clínica"}
                      {r.assigned_to_name && ` · ${r.assigned_to_name}`}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[0.62rem] text-muted-foreground">
                    {freqLabel({ freq: r.freq, weekday: r.weekday, monthday: r.monthday })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* D. Carga por responsável */}
        <Section title="Carga por responsável" icon={Users} hint="abertas · atrasadas">
          {d.byAssignee.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Sem tarefas abertas.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {d.byAssignee.slice(0, 8).map(([id, v]) => (
                <BarRow
                  key={id}
                  label={id === "__none__" ? "Sem responsável" : profileName.get(id) ?? "—"}
                  value={v.open}
                  max={assigneeMax}
                  barClass="bg-brand"
                  suffix={v.overdue > 0 ? <span className="text-red-400"> · {v.overdue}⚠</span> : null}
                />
              ))}
            </div>
          )}
        </Section>

        {/* E. Por clínica */}
        <Section title="Por clínica" icon={Building2} hint="abertas · atrasadas">
          {d.byClinic.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Sem tarefas abertas.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {d.byClinic.slice(0, 8).map((v) => (
                <BarRow
                  key={v.name}
                  label={v.name}
                  value={v.open}
                  max={clinicMax}
                  barClass="bg-sky-500"
                  suffix={v.overdue > 0 ? <span className="text-red-400"> · {v.overdue}⚠</span> : null}
                />
              ))}
            </div>
          )}
        </Section>

        {/* F. Distribuição por prioridade + categoria */}
        <Section title="Distribuição das abertas" icon={ListChecks}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Prioridade
              </span>
              {TASK_PRIORITIES.slice().reverse().map((p) => (
                <BarRow
                  key={p}
                  label={TASK_PRIORITY_LABEL[p]}
                  value={d.byPriority.get(p) ?? 0}
                  max={priorityMax}
                  barClass={PRIORITY_BAR[p]}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Categoria
              </span>
              {d.byCategory.slice(0, 6).map(([slug, v]) => (
                <BarRow key={slug} label={categoryLabel[slug] ?? slug} value={v} max={categoryMax} barClass="bg-brand" />
              ))}
              {d.byCategory.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem tarefas abertas.</p>
              )}
            </div>
          </div>
        </Section>

        {/* G. Envelhecimento */}
        <Section title="Envelhecimento das abertas" icon={CalendarClock} hint="dias desde a criação">
          <div className="flex flex-col gap-2">
            {(["0-3", "4-7", "8-14", "15+"] as const).map((k) => (
              <BarRow
                key={k}
                label={k === "15+" ? "15+ dias" : `${k} dias`}
                value={d.aging[k]}
                max={agingMax}
                barClass={k === "15+" ? "bg-red-500" : k === "8-14" ? "bg-orange-400" : "bg-brand"}
              />
            ))}
          </div>
        </Section>
      </div>

      {/* H. Ritmo (criadas × concluídas, 14 dias) */}
      <Section title="Ritmo — criadas × concluídas (14 dias)" icon={CalendarDays}>
        <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
          {d.series.map((s) => (
            <div key={s.day} className="flex min-w-[1.1rem] flex-1 flex-col items-center gap-1" title={`${fmtDate(s.day)} · ${s.created} criada(s), ${s.completed} concluída(s)`}>
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div
                  className="w-1.5 rounded-t bg-sky-500/70"
                  style={{ height: `${(s.created / maxSeries) * 100}%` }}
                />
                <div
                  className="w-1.5 rounded-t bg-emerald-500/80"
                  style={{ height: `${(s.completed / maxSeries) * 100}%` }}
                />
              </div>
              <span className="text-[0.55rem] tabular-nums text-muted-foreground/60">{fmtDate(s.day).slice(0, 2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4 text-[0.65rem] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-sky-500/70" /> criadas</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-500/80" /> concluídas</span>
        </div>
      </Section>

      {/* I. Concluídas em foco */}
      <Section title="Concluídas em foco" icon={CheckCircle2} hint="recentes · com arquivos e comentários">
        {d.completed.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma tarefa concluída recentemente.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40">
            {d.completed.map((t) => {
              const c = counts[t.id]
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t.id)}
                    className="flex w-full items-center gap-2.5 py-2 text-left hover:opacity-80"
                    title="Abrir para ver arquivos e comentários"
                  >
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{t.title}</span>
                      <span className="block truncate text-[0.68rem] text-muted-foreground">
                        {t.clinic_name ?? "Sem clínica"}
                        {t.assigned_to_name && ` · ${t.assigned_to_name}`}
                        {t.completed_at && ` · ${fmtDate(t.completed_at)}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-[0.68rem] tabular-nums text-muted-foreground">
                      {c?.attachments ? (
                        <span className="flex items-center gap-0.5" title={`${c.attachments} arquivo(s)`}>
                          <Paperclip className="size-3" />
                          {c.attachments}
                        </span>
                      ) : null}
                      {c?.comments ? (
                        <span className="flex items-center gap-0.5" title={`${c.comments} comentário(s)`}>
                          <MessageSquare className="size-3" />
                          {c.comments}
                        </span>
                      ) : null}
                      <ArrowRight className="size-3.5 text-muted-foreground/50" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
