"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Mail, MessageCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateClinicStrategist } from "@/lib/clinics/actions"
import { waLink, type PartnerContact } from "@/lib/clinics/partner-contacts"

const NONE = "__none__"

interface ClinicStrategistSelectProps {
  clinicId: string
  current: string | null
  contacts: PartnerContact[]
}

export function ClinicStrategistSelect({ clinicId, current, contacts }: ClinicStrategistSelectProps) {
  const [strategist, setStrategist] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

  // Selecionáveis: ativos + o valor atual (mesmo que tenha sido desativado).
  const names = useMemo(() => {
    const set = new Set(contacts.filter((c) => c.active).map((c) => c.name))
    if (strategist) set.add(strategist)
    return [...set]
  }, [contacts, strategist])

  const selected = contacts.find((c) => c.name === strategist) ?? null
  const wa = waLink(selected?.phone)

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
    <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-64">
      <Select
        value={strategist || NONE}
        items={{ [NONE]: "— Não definido —", ...Object.fromEntries(names.map((n) => [n, n])) }}
        onValueChange={onChange}
        disabled={pending}
      >
        <SelectTrigger id="clinic-strategist" className="w-full">
          <SelectValue placeholder="Selecione o estrategista" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Não definido —</SelectItem>
          {names.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (selected.email || wa) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {selected.email && (
            <a
              href={`mailto:${selected.email}`}
              className="inline-flex min-w-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              title={selected.email}
            >
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{selected.email}</span>
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-500 transition-colors hover:bg-emerald-500/25"
            >
              <MessageCircle className="size-3" />
              WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  )
}
