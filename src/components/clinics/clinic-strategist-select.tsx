"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Mail, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateClinicStrategists } from "@/lib/clinics/actions"
import { waLink, type PartnerContact } from "@/lib/clinics/partner-contacts"
import { WhatsAppButton } from "@/components/ui/whatsapp-button"

const ADD = "__add__"

interface ClinicStrategistSelectProps {
  clinicId: string
  current: string[]
  contacts: PartnerContact[]
}

// Multi-estrategista: uma clínica pode ter mais de um. Mostra cada um como
// chip com e-mail + botão de WhatsApp; um select abaixo adiciona outro.
export function ClinicStrategistSelect({ clinicId, current, contacts }: ClinicStrategistSelectProps) {
  const [strategists, setStrategists] = useState<string[]>(current ?? [])
  const [pending, startTransition] = useTransition()

  const byName = new Map(contacts.map((c) => [c.name, c]))
  const available = contacts.filter((c) => c.active && !strategists.includes(c.name))

  function persist(next: string[]) {
    const prev = strategists
    setStrategists(next) // optimistic
    startTransition(async () => {
      const res = await updateClinicStrategists(clinicId, next)
      if (!res.ok) {
        setStrategists(prev) // revert
        toast.error(res.error)
      } else {
        toast.success("Estrategistas atualizados")
      }
    })
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-72">
      {strategists.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {strategists.map((name) => {
            const c = byName.get(name)
            const wa = waLink(c?.phone)
            return (
              <li
                key={name}
                className="flex flex-col gap-1 rounded-md border border-border/60 bg-accent/20 px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{name}</span>
                  <button
                    type="button"
                    onClick={() => persist(strategists.filter((s) => s !== name))}
                    disabled={pending}
                    title="Remover estrategista"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {c && (c.email || wa) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex min-w-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                        title={c.email}
                      >
                        <Mail className="size-3 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </a>
                    )}
                    <WhatsAppButton phone={c.phone} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {available.length > 0 ? (
        <Select
          value={ADD}
          items={{
            [ADD]: strategists.length ? "+ Adicionar estrategista" : "Selecione o estrategista",
            ...Object.fromEntries(available.map((c) => [c.name, c.name])),
          }}
          onValueChange={(v) => {
            if (v && v !== ADD) persist([...strategists, v])
          }}
          disabled={pending}
        >
          <SelectTrigger id="clinic-strategist" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ADD}>
              {strategists.length ? "+ Adicionar estrategista" : "Selecione o estrategista"}
            </SelectItem>
            {available.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        strategists.length === 0 && <span className="text-sm text-muted-foreground">— Não definido —</span>
      )}
    </div>
  )
}
