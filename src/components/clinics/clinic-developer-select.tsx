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
import { updateClinicDeveloper, type UserProfile } from "@/lib/users/actions"

const NONE = "__none__"

interface ClinicDeveloperSelectProps {
  clinicId: string
  current: string | null
  profiles: UserProfile[]
}

export function ClinicDeveloperSelect({ clinicId, current, profiles }: ClinicDeveloperSelectProps) {
  const [developer, setDeveloper] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

  function onChange(val: string | null) {
    if (!val) return
    const next = val === NONE ? "" : val
    const prev = developer
    setDeveloper(next) // optimistic

    startTransition(async () => {
      const res = await updateClinicDeveloper(clinicId, next || null)
      if (!res.ok) {
        setDeveloper(prev) // revert
        toast.error(res.error)
      } else {
        toast.success("Desenvolvedor atualizado")
      }
    })
  }

  return (
    <Select
      value={developer || NONE}
      items={{
        [NONE]: "— Sem responsável —",
        ...Object.fromEntries(profiles.map((p) => [p.id, p.name || p.email || p.id.slice(0, 8)])),
      }}
      onValueChange={onChange}
      disabled={pending}
    >
      <SelectTrigger id="clinic-developer" className="w-full sm:w-56">
        <SelectValue placeholder="Selecione o desenvolvedor" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Sem responsável —</SelectItem>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name || p.email || p.id.slice(0, 8)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
