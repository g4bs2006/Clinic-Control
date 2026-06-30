"use client"

import { useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

export interface TrendSeries {
  /** Data key present on each point (the clinic name) */
  key: string
  /** Line color (hex) */
  color: string
}

interface TrendChartProps {
  /** One object per month: { month: "abr/25", [clinicName]: 12.5 | null, ... } — rates already in % */
  data: Array<Record<string, string | number | null>>
  series: TrendSeries[]
}

// pt-BR rate formatting for axis/tooltip (value already in %)
function fmtPct(v: number): string {
  return (
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%"
  )
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  // Only show series that have a value this month, strongest first
  const rows = payload
    .filter((p) => p.value !== null && p.value !== undefined)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  if (!rows.length) return null

  return (
    <div
      style={{
        background: "oklch(0.26 0.04 235)",
        border: "1px solid oklch(0.35 0.04 225)",
        borderRadius: "0.5rem",
        padding: "0.5rem 0.75rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: "10rem",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          color: "oklch(0.65 0.02 215)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          marginBottom: "0.375rem",
          textTransform: "capitalize",
        }}
      >
        {label}
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.0625rem 0",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "0.5rem",
              height: "0.5rem",
              borderRadius: "9999px",
              background: r.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "0.75rem",
              color: "oklch(0.97 0.005 210)",
              flex: 1,
            }}
          >
            {r.name}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: "oklch(0.97 0.005 210)",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtPct(r.value as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TrendChart({ data, series }: TrendChartProps) {
  // Interactive selection: clicking a legend chip toggles that clinic's line.
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!series.length) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "260px",
          color: "oklch(0.65 0.02 215)",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "1.5rem", opacity: 0.4 }}>—</span>
        <span style={{ fontSize: "0.8rem" }}>Sem dados para o período</span>
      </div>
    )
  }

  return (
    <div style={{ width: "100%" }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="oklch(0.32 0.03 230)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "oklch(0.65 0.02 215)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "oklch(0.32 0.03 230)" }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "oklch(0.65 0.02 215)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls
              hide={hidden.has(s.key)}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Interactive legend — click to show/hide a clinic */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.375rem 0.75rem",
          marginTop: "0.75rem",
        }}
      >
        {series.map((s) => {
          const off = hidden.has(s.key)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                opacity: off ? 0.4 : 1,
                padding: "0.125rem 0.25rem",
                transition: "opacity 0.12s ease",
              }}
              aria-pressed={!off}
              title={off ? `Mostrar ${s.key}` : `Ocultar ${s.key}`}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "0.75rem",
                  height: "0.1875rem",
                  borderRadius: "9999px",
                  background: s.color,
                }}
              />
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "oklch(0.85 0.01 215)",
                  fontWeight: 500,
                  textDecoration: off ? "line-through" : "none",
                }}
              >
                {s.key}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
