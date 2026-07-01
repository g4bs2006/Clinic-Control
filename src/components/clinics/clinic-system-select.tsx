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
import { CLINIC_SYSTEMS } from "@/lib/clinics/systems"
import { updateClinicSystem } from "@/lib/clinics/actions"

const NONE = "__none__"

interface ClinicSystemSelectProps {
  clinicId: string
  current: string | null
}

export function ClinicSystemSelect({ clinicId, current }: ClinicSystemSelectProps) {
  const [system, setSystem] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

  function onChange(val: string | null) {
    if (!val) return
    const next = val === NONE ? "" : val
    const prev = system
    setSystem(next) // optimistic

    startTransition(async () => {
      const res = await updateClinicSystem(clinicId, next)
      if (!res.ok) {
        setSystem(prev) // revert
        toast.error(res.error)
      } else {
        toast.success("Sistema atualizado")
      }
    })
  }

  return (
    <Select value={system || NONE} onValueChange={onChange} disabled={pending}>
      <SelectTrigger id="clinic-system" className="w-full sm:w-56">
        <SelectValue placeholder="Selecione o sistema" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Não definido —</SelectItem>
        {CLINIC_SYSTEMS.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
