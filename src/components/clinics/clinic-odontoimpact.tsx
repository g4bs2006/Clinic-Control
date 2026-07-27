"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Mail, MessageCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateClinicOdontoImpact } from "@/lib/clinics/actions"
import { waLink, type PartnerContact } from "@/lib/clinics/partner-contacts"

const NONE = "__none__"

interface ClinicOdontoImpactProps {
  clinicId: string
  currentOdontoImpact: boolean
  currentTrafficManager: string | null
  contacts: PartnerContact[]
}

// Controle compacto para a linha "OdontoImpact" da ficha: switch da assinatura
// + (quando ativa) select do gestor de tráfego, com e-mail + botão de WhatsApp
// do gestor selecionado. Desligar a assinatura limpa o gestor no servidor.
export function ClinicOdontoImpact({
  clinicId,
  currentOdontoImpact,
  currentTrafficManager,
  contacts,
}: ClinicOdontoImpactProps) {
  const [odontoimpact, setOdontoimpact] = useState(currentOdontoImpact)
  const [trafficManager, setTrafficManager] = useState<string>(currentTrafficManager ?? "")
  const [pending, startTransition] = useTransition()

  const names = useMemo(() => {
    const set = new Set(contacts.filter((c) => c.active).map((c) => c.name))
    if (trafficManager) set.add(trafficManager)
    return [...set]
  }, [contacts, trafficManager])

  const selected = contacts.find((c) => c.name === trafficManager) ?? null
  const wa = waLink(selected?.phone)

  function save(nextEnabled: boolean, nextManager: string) {
    const prevEnabled = odontoimpact
    const prevManager = trafficManager
    setOdontoimpact(nextEnabled) // optimistic
    setTrafficManager(nextEnabled ? nextManager : "")

    startTransition(async () => {
      const res = await updateClinicOdontoImpact(clinicId, {
        odontoimpact: nextEnabled,
        traffic_manager: nextManager,
      })
      if (!res.ok) {
        setOdontoimpact(prevEnabled) // revert
        setTrafficManager(prevManager)
        toast.error(res.error)
      } else {
        toast.success("OdontoImpact atualizado")
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-2">
          <Switch
            id="clinic-odontoimpact"
            checked={odontoimpact}
            onCheckedChange={(checked) => save(checked, trafficManager)}
            disabled={pending}
            aria-label="Assinatura OdontoImpact"
          />
          {!odontoimpact && <span className="text-xs text-muted-foreground">Sem assinatura</span>}
        </div>
        {odontoimpact && (
          <Select
            value={trafficManager || NONE}
            items={{ [NONE]: "— Gestor —", ...Object.fromEntries(names.map((n) => [n, n])) }}
            onValueChange={(val) => {
              if (val) save(true, val === NONE ? "" : val)
            }}
            disabled={pending}
          >
            <SelectTrigger id="clinic-traffic-manager" className="w-full sm:w-52">
              <SelectValue placeholder="Gestor de tráfego" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Gestor —</SelectItem>
              {names.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {odontoimpact && selected && (selected.email || wa) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end">
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
