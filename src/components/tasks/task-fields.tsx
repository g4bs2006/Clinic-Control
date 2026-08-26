"use client"

import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

export const NO_CLINIC = "__none__"

export type ClinicOption = { id: string; name: string }
export type ProfileOption = { id: string; name: string | null; email: string | null }

export function profileLabel(p: ProfileOption): string {
  return p.name || p.email || p.id.slice(0, 8)
}

interface TaskFieldsProps {
  clinics: ClinicOption[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  clinicId: string | null
  onClinicIdChange: (v: string | null) => void
  category: TaskCategory
  onCategoryChange: (v: TaskCategory) => void
  priority: TaskPriority
  onPriorityChange: (v: TaskPriority) => void
  /** Lista plana de responsáveis — todos igualmente responsáveis (ADR 0008). */
  assigneeIds: string[]
  onAssigneeIdsChange: (v: string[]) => void
  dueDate: string
  onDueDateChange: (v: string) => void
  /** Trava o select de clínica (ex.: sugestão já veio de uma clínica específica). */
  lockClinic?: boolean
  /** Oculta o select de clínica (ex.: quando a seleção de clínicas é múltipla, fora daqui). */
  hideClinic?: boolean
  /** Tarefa interna (ADR 0009): o toggle desabilita o select de clínica. */
  isInternal?: boolean
  onIsInternalChange?: (v: boolean) => void
  status?: TaskStatus
  onStatusChange?: (v: TaskStatus) => void
  /** Etapa de aprovação (ADR 0010): só gestor conclui tarefa interna. */
  isGestor?: boolean
}

export function TaskFields({
  clinics,
  profiles,
  categories,
  clinicId,
  onClinicIdChange,
  category,
  onCategoryChange,
  priority,
  onPriorityChange,
  assigneeIds,
  onAssigneeIdsChange,
  dueDate,
  onDueDateChange,
  lockClinic,
  hideClinic,
  isInternal,
  onIsInternalChange,
  status,
  onStatusChange,
  isGestor = false,
}: TaskFieldsProps) {
  // Etapa de aprovação (ADR 0010): "em aprovação" só existe pra tarefa
  // interna; "concluída" fica fora do select pra quem não é gestor numa
  // tarefa interna — evita uma escolha que o servidor recusaria.
  const statusOptions = TASK_STATUSES.filter((s) => {
    if (s === "em_aprovacao" && !isInternal) return false
    if (s === "concluida" && isInternal && !isGestor) return false
    return true
  })
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {!hideClinic && (
        <label className={`${status !== undefined && onStatusChange ? "" : "sm:col-span-2"} flex flex-col gap-1 text-xs text-muted-foreground`}>
          Clínica
          {onIsInternalChange && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border/60 bg-transparent px-2.5 py-2 text-sm text-foreground">
              <Checkbox
                checked={isInternal === true}
                onCheckedChange={(v) => onIsInternalChange(v === true)}
              />
              Tarefa interna (sem clínica)
            </label>
          )}
          <Select
            value={clinicId ?? NO_CLINIC}
            disabled={lockClinic || isInternal === true}
            items={{
              [NO_CLINIC]: "Sem clínica (interna)",
              ...Object.fromEntries(clinics.map((c) => [c.id, c.name])),
            }}
            onValueChange={(v) => onClinicIdChange(v && v !== NO_CLINIC ? v : null)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Com o toggle presente, a opção "Sem clínica" sai do select: a
                  escolha de natureza fica explícita no checkbox (ADR 0009). */}
              {!onIsInternalChange && <SelectItem value={NO_CLINIC}>Sem clínica (interna)</SelectItem>}
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      {status !== undefined && onStatusChange && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Status
          <Select
            value={status}
            items={Object.fromEntries(statusOptions.map((s) => [s, TASK_STATUS_LABEL[s]]))}
            onValueChange={(v) => v && onStatusChange(v as TaskStatus)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Categoria
        <Select
          value={category}
          items={{
            ...Object.fromEntries(categories.map((c) => [c.slug, c.label])),
            ...(categories.some((c) => c.slug === category) ? {} : { [category]: category }),
          }}
          onValueChange={(v) => v && onCategoryChange(v as TaskCategory)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.label}
              </SelectItem>
            ))}
            {!categories.some((c) => c.slug === category) && (
              <SelectItem value={category}>{category}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Prioridade
        <Select
          value={priority}
          items={Object.fromEntries(TASK_PRIORITIES.map((p) => [p, TASK_PRIORITY_LABEL[p]]))}
          onValueChange={(v) => v && onPriorityChange(v as TaskPriority)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TASK_PRIORITY_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <AssigneesField profiles={profiles} assigneeIds={assigneeIds} onAssigneeIdsChange={onAssigneeIdsChange} />

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Prazo
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          className="h-8"
        />
      </label>
    </div>
  )
}

/**
 * Seletor de responsáveis (multi) — checkbox list num popover, mesmo padrão
 * do seletor de clínicas do CreateTaskDialog. Fica aqui (não num arquivo à
 * parte) porque só o TaskFields usa; exportado para o caso de outro dialog
 * de tarefa precisar do mesmo picker sem duplicar.
 */
export function AssigneesField({
  profiles,
  assigneeIds,
  onAssigneeIdsChange,
}: {
  profiles: ProfileOption[]
  assigneeIds: string[]
  onAssigneeIdsChange: (v: string[]) => void
}) {
  const [query, setQuery] = useState("")
  const selected = profiles.filter((p) => assigneeIds.includes(p.id))
  const filtered = query.trim()
    ? profiles.filter((p) => profileLabel(p).toLowerCase().includes(query.trim().toLowerCase()))
    : profiles

  function toggle(id: string) {
    onAssigneeIdsChange(
      assigneeIds.includes(id) ? assigneeIds.filter((x) => x !== id) : [...assigneeIds, id],
    )
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Responsáveis
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-8 items-center justify-between rounded-md border border-input bg-transparent px-3 text-left text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="truncate">
                {selected.length === 0 ? "Sem responsável" : selected.map(profileLabel).join(", ")}
              </span>
            </button>
          }
        />
        <PopoverContent align="start" className="w-64 p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="mb-2 h-8"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Ninguém encontrado.</p>
            ) : (
              filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent/40"
                >
                  <Checkbox checked={assigneeIds.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                  {profileLabel(p)}
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </label>
  )
}
