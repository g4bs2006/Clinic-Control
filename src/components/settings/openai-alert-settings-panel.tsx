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

  // Contenção ativa
  const [contEnabled, setContEnabled] = useState(settings.containmentEnabled)
  const [maxSessions, setMaxSessions] = useState(String(settings.containmentMaxSessions))
  const [minDup, setMinDup] = useState(String(Math.round(settings.containmentMinDupRatio * 100)))
  const [minIa, setMinIa] = useState(String(settings.containmentMinIaMsgs))
  const [minHours, setMinHours] = useState(String(settings.containmentMinActiveHours))

  function save() {
    startTransition(async () => {
      const res = await updateOpenAiAlertSettings({
        enabled,
        dailyLimitUsd: Number(dailyLimit.replace(",", ".")),
        spikeMultiplier: Number(multiplier.replace(",", ".")),
        minCostUsd: Number(minCost.replace(",", ".")),
        containmentEnabled: contEnabled,
        containmentMaxSessions: Number(maxSessions),
        containmentMinDupRatio: Number(minDup.replace(",", ".")) / 100,
        containmentMinIaMsgs: Number(minIa),
        containmentMinActiveHours: Number(minHours),
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

      {/* ── Contenção ativa ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
        <div className="flex items-start gap-2">
          <Switch
            id="openai-containment-enabled"
            checked={contEnabled}
            onCheckedChange={setContEnabled}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="openai-containment-enabled" className="text-sm">
              Contenção ativa — concluir conversas em loop automaticamente
            </Label>
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              Ao estourar o limite, o sistema investiga as conversas das últimas 48h sozinho,
              conclui na Helena as que forem loop de robô (interrompendo o chatbot) e avisa no
              grupo o que fechou e por quê.{" "}
              <span className="text-amber-500/90">
                Desligado, a rodada ainda acontece e relata o que teria fechado — sem tocar em
                nada.
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cont-max" className="text-xs text-muted-foreground">
              Máx. por rodada
            </Label>
            <Input
              id="cont-max"
              inputMode="numeric"
              value={maxSessions}
              onChange={(e) => setMaxSessions(e.target.value)}
            />
            <p className="text-[0.65rem] text-muted-foreground">conversas</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cont-dup" className="text-xs text-muted-foreground">
              Repetição mín. (%)
            </Label>
            <Input
              id="cont-dup"
              inputMode="numeric"
              value={minDup}
              onChange={(e) => setMinDup(e.target.value)}
            />
            <p className="text-[0.65rem] text-muted-foreground">msgs iguais do contato</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cont-ia" className="text-xs text-muted-foreground">
              Respostas da IA
            </Label>
            <Input
              id="cont-ia"
              inputMode="numeric"
              value={minIa}
              onChange={(e) => setMinIa(e.target.value)}
            />
            <p className="text-[0.65rem] text-muted-foreground">mínimo na janela</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cont-hours" className="text-xs text-muted-foreground">
              Horas ativas
            </Label>
            <Input
              id="cont-hours"
              inputMode="numeric"
              value={minHours}
              onChange={(e) => setMinHours(e.target.value)}
            />
            <p className="text-[0.65rem] text-muted-foreground">distintas no dia</p>
          </div>
        </div>
        <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
          Os três critérios são exigidos <strong>juntos</strong> — um paciente real pode bater um
          deles, dificilmente os três. Afrouxar aumenta o risco de encerrar um atendimento
          legítimo.
        </p>
      </div>

      <div>
        <Button onClick={save} disabled={pending} size="sm">
          {pending ? "Salvando…" : "Salvar alertas"}
        </Button>
      </div>
    </div>
  )
}
