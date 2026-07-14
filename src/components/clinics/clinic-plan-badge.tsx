"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { updateClinicPlan } from "@/lib/clinics/actions"

const NONE = "__none__"

interface ClinicPlanBadgeProps {
  clinicId: string
  current: "black" | "elite" | null
}

// Selo do plano no cabeçalho da clínica — leitura à primeira vista (junto de
// Ativo/Automática/status) e editável ao clicar. Black = pílula escura sólida;
// Elite = dourada; sem plano = contorno tracejado discreto ("Definir plano").
export function ClinicPlanBadge({ clinicId, current }: ClinicPlanBadgeProps) {
  const [plan, setPlan] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

  function onChange(val: string | null) {
    if (!val) return
    const next = val === NONE ? "" : val
    const prev = plan
    setPlan(next) // optimistic

    startTransition(async () => {
      const res = await updateClinicPlan(clinicId, (next || null) as "black" | "elite" | null)
      if (!res.ok) {
        setPlan(prev) // revert
        toast.error(res.error)
      } else {
        toast.success("Plano atualizado")
      }
    })
  }

  const tone =
    plan === "black"
      ? "border-transparent bg-zinc-900 text-white hover:bg-zinc-800 dark:border dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      : plan === "elite"
        ? "border border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
        : "border border-dashed border-border bg-transparent text-muted-foreground hover:bg-accent"

  return (
    <Select
      value={plan || NONE}
      items={{ [NONE]: "Definir plano", black: "Black", elite: "Elite" }}
      onValueChange={onChange}
      disabled={pending}
    >
      <SelectTrigger
        aria-label="Plano da clínica"
        className={cn(
          "h-auto w-fit gap-1 rounded-full py-1 pr-1.5 pl-2.5 text-xs font-semibold transition-colors",
          tone
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectItem value={NONE}>— Não definido —</SelectItem>
        <SelectItem value="black">Black</SelectItem>
        <SelectItem value="elite">Elite</SelectItem>
      </SelectContent>
    </Select>
  )
}
