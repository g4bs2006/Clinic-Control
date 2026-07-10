"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type TaskCategory,
  type TaskPriority,
} from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

export const NO_CLINIC = "__none__"
export const UNASSIGNED = "__unassigned__"

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
  assignedTo: string | null
  onAssignedToChange: (v: string | null) => void
  dueDate: string
  onDueDateChange: (v: string) => void
  /** Trava o select de clínica (ex.: sugestão já veio de uma clínica específica). */
  lockClinic?: boolean
  /** Oculta o select de clínica (ex.: quando a seleção de clínicas é múltipla, fora daqui). */
  hideClinic?: boolean
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
  assignedTo,
  onAssignedToChange,
  dueDate,
  onDueDateChange,
  lockClinic,
  hideClinic,
}: TaskFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {!hideClinic && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">
          Clínica
          <Select
            value={clinicId ?? NO_CLINIC}
            disabled={lockClinic}
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
              <SelectItem value={NO_CLINIC}>Sem clínica (interna)</SelectItem>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Responsável
        <Select
          value={assignedTo ?? UNASSIGNED}
          items={{
            [UNASSIGNED]: "Sem responsável",
            ...Object.fromEntries(profiles.map((p) => [p.id, profileLabel(p)])),
          }}
          onValueChange={(v) => onAssignedToChange(v && v !== UNASSIGNED ? v : null)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {profileLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

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
