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
import { getDailyFunnelForMonth } from "@/lib/clinics/integration-actions"
import type { DailyFunnelPoint } from "@/lib/helena/funnel"

const CLINIC_COLOR = "#7C3AED"

function dayLabel(day: string): string {
  return day.slice(8, 10)
}

interface DailyRateChartProps {
  clinicId: string
  clinicName: string
  monthOptions: { key: string; label: string }[]
  initialMonth: string
  initialDays: DailyFunnelPoint[]
}

export function DailyRateChart({
  clinicId,
  clinicName,
  monthOptions,
  initialMonth,
  initialDays,
}: DailyRateChartProps) {
  const [month, setMonth] = useState(initialMonth)
  const [days, setDays] = useState(initialDays)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function changeMonth(newMonth: string) {
    setMonth(newMonth)
    startTransition(async () => {
      const res = await getDailyFunnelForMonth(clinicId, newMonth)
      if (res.ok) {
        setDays(res.days)
        setError(null)
      } else {
        setError(res.error)
        setDays([])
      }
    })
  }

  const totalLeads = days.reduce((s, d) => s + d.leads, 0)
  const totalScheduled = days.reduce((s, d) => s + d.scheduled, 0)

  const chartData = days.map((d) => ({
    day: dayLabel(d.day),
    [clinicName]: d.rate === null ? null : Number((d.rate * 100).toFixed(2)),
  }))
  const series: TrendSeries[] = [{ key: clinicName, color: CLINIC_COLOR }]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {totalLeads} lead{totalLeads !== 1 ? "s" : ""} · {totalScheduled} agendado
          {totalScheduled !== 1 ? "s" : ""} no mês
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
        <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
          <TrendChart data={chartData} series={series} />
        </div>
      )}
    </div>
  )
}
