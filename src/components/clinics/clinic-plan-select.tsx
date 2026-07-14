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
import { updateClinicPlan } from "@/lib/clinics/actions"

const NONE = "__none__"

const PLAN_LABEL: Record<string, string> = {
  black: "Black",
  elite: "Elite",
}

interface ClinicPlanSelectProps {
  clinicId: string
  current: "black" | "elite" | null
}

export function ClinicPlanSelect({ clinicId, current }: ClinicPlanSelectProps) {
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

  return (
    <Select
      value={plan || NONE}
      items={{
        [NONE]: "— Não definido —",
        black: PLAN_LABEL.black,
        elite: PLAN_LABEL.elite,
      }}
      onValueChange={onChange}
      disabled={pending}
    >
      <SelectTrigger id="clinic-plan" className="w-full sm:w-56">
        <SelectValue placeholder="Selecione o plano" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Não definido —</SelectItem>
        <SelectItem value="black">{PLAN_LABEL.black}</SelectItem>
        <SelectItem value="elite">{PLAN_LABEL.elite}</SelectItem>
      </SelectContent>
    </Select>
  )
}
