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
import { STRATEGISTS } from "@/lib/clinics/strategists"
import { updateClinicStrategist } from "@/lib/clinics/actions"

const NONE = "__none__"

interface ClinicStrategistSelectProps {
  clinicId: string
  current: string | null
}

export function ClinicStrategistSelect({ clinicId, current }: ClinicStrategistSelectProps) {
  const [strategist, setStrategist] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

  function onChange(val: string | null) {
    if (!val) return
    const next = val === NONE ? "" : val
    const prev = strategist
    setStrategist(next) // optimistic

    startTransition(async () => {
      const res = await updateClinicStrategist(clinicId, next)
      if (!res.ok) {
        setStrategist(prev) // revert
        toast.error(res.error)
      } else {
        toast.success("Estrategista atualizado")
      }
    })
  }

  return (
    <Select
      value={strategist || NONE}
      items={{
        [NONE]: "— Não definido —",
        ...Object.fromEntries(STRATEGISTS.map((s) => [s, s])),
      }}
      onValueChange={onChange}
      disabled={pending}
    >
      <SelectTrigger id="clinic-strategist" className="w-full sm:w-64">
        <SelectValue placeholder="Selecione o estrategista" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Não definido —</SelectItem>
        {STRATEGISTS.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
