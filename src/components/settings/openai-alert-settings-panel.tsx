"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  updateOpenAiAlertSettings,
  type OpenAiAlertSettings,
} from "@/lib/openai-usage/actions"

export function OpenAiAlertSettingsPanel({ settings }: { settings: OpenAiAlertSettings }) {
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [dailyLimit, setDailyLimit] = useState(String(settings.dailyLimitUsd))
  const [multiplier, setMultiplier] = useState(String(settings.spikeMultiplier))
  const [minCost, setMinCost] = useState(String(settings.minCostUsd))

  function save() {
    startTransition(async () => {
      const res = await updateOpenAiAlertSettings({
        enabled,
        dailyLimitUsd: Number(dailyLimit.replace(",", ".")),
        spikeMultiplier: Number(multiplier.replace(",", ".")),
        minCostUsd: Number(minCost.replace(",", ".")),
      })
      if (res.ok) toast.success("Alertas de gasto OpenAI salvos.")
      else toast.error(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Switch id="openai-alerts-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="openai-alerts-enabled" className="text-sm">
          Alertar gasto anormal (cria acompanhamento para o dev da clínica)
        </Label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openai-daily-limit" className="text-xs text-muted-foreground">
            Limite diário (US$)
          </Label>
          <Input
            id="openai-daily-limit"
            inputMode="decimal"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
          />
          <p className="text-[0.65rem] text-muted-foreground">
            Acima disso alerta sempre · por clínica dá para sobrescrever
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openai-multiplier" className="text-xs text-muted-foreground">
            Anomalia (× média 7 dias)
          </Label>
          <Input
            id="openai-multiplier"
            inputMode="decimal"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
          />
          <p className="text-[0.65rem] text-muted-foreground">
            Dia acima de N× a média dos 7 anteriores = pico
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openai-min-cost" className="text-xs text-muted-foreground">
            Piso (US$)
          </Label>
          <Input
            id="openai-min-cost"
            inputMode="decimal"
            value={minCost}
            onChange={(e) => setMinCost(e.target.value)}
          />
          <p className="text-[0.65rem] text-muted-foreground">
            Dias abaixo disso nunca alertam (evita alarme de centavos)
          </p>
        </div>
      </div>

      <div>
        <Button onClick={save} disabled={pending} size="sm">
          {pending ? "Salvando…" : "Salvar alertas"}
        </Button>
      </div>
    </div>
  )
}
