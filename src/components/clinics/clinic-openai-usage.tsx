"use client"

import { useState, useTransition } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { USD_TO_BRL, formatBrl } from "@/lib/ai-usage/pricing"
import { getClinicOpenAiUsage, type ClinicOpenAiUsage } from "@/lib/openai-usage/actions"

const COST_COLOR = "#f59e0b" // âmbar: dinheiro, distinto do roxo da taxa
const TOKENS_IN_COLOR = "#22d3ee"
const TOKENS_OUT_COLOR = "#34d399"

type LinkedUsage = Extract<ClinicOpenAiUsage, { linked: true }>

function fmtUsd(v: number): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtTokens(v: number): string {
  return v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
}

interface ClinicOpenAiUsagePanelProps {
  clinicId: string
  monthOptions: { key: string; label: string }[]
  initialMonth: string
  initial: LinkedUsage
}

export function ClinicOpenAiUsagePanel({
  clinicId,
  monthOptions,
  initialMonth,
  initial,
}: ClinicOpenAiUsagePanelProps) {
  const [month, setMonth] = useState(initialMonth)
  const [usage, setUsage] = useState<LinkedUsage>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function changeMonth(newMonth: string) {
    setMonth(newMonth)
    startTransition(async () => {
      const res = await getClinicOpenAiUsage(clinicId, newMonth)
      if (res.ok && res.linked) {
        setUsage(res)
        setError(null)
      } else {
        setError(res.ok ? "Clínica sem API key vinculada" : res.error)
      }
    })
  }

  // Ontem vs média 7d: o número que denuncia o pico antes do mês fechar caro.
  const spike =
    usage.avg7CostUsd && usage.avg7CostUsd > 0
      ? usage.yesterdayCostUsd / usage.avg7CostUsd
      : null

  const costData = usage.days.map((d) => ({
    day: d.day.slice(8, 10),
    "Custo (US$)": Number(d.costUsd.toFixed(4)),
  }))
  const costSeries: TrendSeries[] = [{ key: "Custo (US$)", color: COST_COLOR }]

  const tokenData = usage.days.map((d) => ({
    day: d.day.slice(8, 10),
    Entrada: d.inputTokens,
    Saída: d.outputTokens,
  }))
  const tokenSeries: TrendSeries[] = [
    { key: "Entrada", color: TOKENS_IN_COLOR },
    { key: "Saída", color: TOKENS_OUT_COLOR },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {usage.monthRequests.toLocaleString("pt-BR")} requisições no mês · dias em UTC,
          igual ao dashboard da OpenAI
        </p>
        <Select
          value={month}
          items={Object.fromEntries(monthOptions.map((o) => [o.key, o.label]))}
          onValueChange={(val) => val && changeMonth(val)}
        >
          <SelectTrigger className="h-8 text-sm min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <div
          className="flex flex-col gap-5"
          style={{ opacity: pending ? 0.6 : 1, transition: "opacity 0.15s ease" }}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Custo (mês)"
              value={fmtUsd(usage.monthCostUsd)}
              accent="teal"
              hint={`≈ ${formatBrl(usage.monthCostUsd * USD_TO_BRL)} (câmbio fixo ${USD_TO_BRL})`}
            />
            <KpiCard
              label="Tokens (mês)"
              value={fmtTokens(usage.monthInputTokens + usage.monthOutputTokens)}
              accent="purple"
              hint={`${fmtTokens(usage.monthInputTokens)} entrada · ${fmtTokens(usage.monthOutputTokens)} saída`}
            />
            <KpiCard label="Ontem" value={fmtUsd(usage.yesterdayCostUsd)} />
            <KpiCard
              label="Ontem vs média 7d"
              value={spike ? `${spike.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×` : "—"}
              accent={spike && spike > 2.5 ? "rose" : undefined}
              hint={
                usage.avg7CostUsd !== null
                  ? `média ${fmtUsd(usage.avg7CostUsd)}/dia`
                  : "sem histórico suficiente"
              }
            />
          </div>

          {usage.days.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem consumo registrado neste mês.</p>
          ) : (
            <>
              <div>
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Custo por dia (US$)
                </p>
                <TrendChart data={costData} series={costSeries} formatValue={fmtUsd} xKey="day" />
              </div>
              <div>
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Tokens por dia — entrada vs. saída
                </p>
                <TrendChart data={tokenData} series={tokenSeries} formatValue={fmtTokens} xKey="day" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
