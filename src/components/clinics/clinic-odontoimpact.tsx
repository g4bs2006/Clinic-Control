"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
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

  function onToggle(checked: boolean) {
    save(checked, trafficManager)
  }

  function onManagerChange(val: string | null) {
    if (!val) return
    save(true, val === NONE ? "" : val)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch
          id="clinic-odontoimpact"
          checked={odontoimpact}
          onCheckedChange={onToggle}
          disabled={pending}
        />
        <Label htmlFor="clinic-odontoimpact" className="text-sm font-medium cursor-pointer">
          Assinatura OdontoImpact (tráfego pago)
        </Label>
      </div>
      {odontoimpact && (
        <Select
          value={trafficManager || NONE}
          items={{
            [NONE]: "— Não definido —",
            ...Object.fromEntries(TRAFFIC_MANAGERS.map((m) => [m, m])),
          }}
          onValueChange={onManagerChange}
          disabled={pending}
        >
          <SelectTrigger id="clinic-traffic-manager" className="w-full sm:w-64">
            <SelectValue placeholder="Selecione o gestor de tráfego" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— Não definido —</SelectItem>
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
