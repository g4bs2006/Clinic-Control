"use client"

import { useState, useTransition } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FunnelView } from "@/components/dashboard/funnel-view"
import { getFunnelForMonth } from "@/lib/clinics/integration-actions"

/** Mesmo shape do retorno de buildLiveFunnel (via getFunnelForMonth). */
type FunnelData = {
  steps: { title: string; count: number }[]
  leads: number
  scheduled: number
  attended: number
  closed: number
  noShow: number
  notScheduled: number
  rate: number
  revenue: number
}

interface ClinicFunnelExplorerProps {
  clinicId: string
  monthOptions: { key: string; label: string }[]
  initialMonth: string
  initialFunnel: FunnelData
}

/**
 * Funil da clínica com seletor de mês — o backend (getFunnelForMonth) já aceita
 * mês arbitrário; aqui só trocamos o mês client-side, sem navegação de página.
 * Mesmo padrão do DailyRateChart.
 */
export function ClinicFunnelExplorer({
  clinicId,
  monthOptions,
  initialMonth,
  initialFunnel,
}: ClinicFunnelExplorerProps) {
  const [month, setMonth] = useState(initialMonth)
  const [funnel, setFunnel] = useState<FunnelData | null>(initialFunnel)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function changeMonth(newMonth: string) {
    setMonth(newMonth)
    startTransition(async () => {
      const res = await getFunnelForMonth(clinicId, newMonth)
      if (res.ok) {
        setFunnel(res.funnel)
        setError(null)
      } else {
        setError(res.error)
        setFunnel(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
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
      ) : funnel ? (
        <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
          <FunnelView steps={funnel.steps} totals={funnel} />
        </div>
      ) : null}
    </div>
  )
}
