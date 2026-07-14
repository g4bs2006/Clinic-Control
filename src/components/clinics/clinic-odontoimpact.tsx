"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TRAFFIC_MANAGERS } from "@/lib/clinics/traffic-managers"
import { updateClinicOdontoImpact } from "@/lib/clinics/actions"

const NONE = "__none__"

interface ClinicOdontoImpactProps {
  clinicId: string
  currentOdontoImpact: boolean
  currentTrafficManager: string | null
}

// Controle compacto para a linha "OdontoImpact" da ficha: switch da assinatura
// + (quando ativa) select do gestor de tráfego. Sem label próprio — a linha da
// ficha já rotula o campo. Desligar a assinatura limpa o gestor no servidor.
export function ClinicOdontoImpact({
  clinicId,
  currentOdontoImpact,
  currentTrafficManager,
}: ClinicOdontoImpactProps) {
  const [odontoimpact, setOdontoimpact] = useState(currentOdontoImpact)
  const [trafficManager, setTrafficManager] = useState<string>(currentTrafficManager ?? "")
  const [pending, startTransition] = useTransition()

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
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end">
      <div className="flex items-center gap-2">
        <Switch
          id="clinic-odontoimpact"
          checked={odontoimpact}
          onCheckedChange={(checked) => save(checked, trafficManager)}
          disabled={pending}
          aria-label="Assinatura OdontoImpact"
        />
        {!odontoimpact && (
          <span className="text-xs text-muted-foreground">Sem assinatura</span>
        )}
      </div>
      {odontoimpact && (
        <Select
          value={trafficManager || NONE}
          items={{
            [NONE]: "— Gestor —",
            ...Object.fromEntries(TRAFFIC_MANAGERS.map((m) => [m, m])),
          }}
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
            {TRAFFIC_MANAGERS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
