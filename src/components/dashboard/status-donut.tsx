"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"

interface StatusEntry {
  label: string
  color: string
  count: number
}

interface StatusDonutProps {
  data: StatusEntry[]
  totalClinics: number
}

// Luminance-based contrast: decide white or dark text on a given hex background
function contrastText(hex: string): string {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.35 ? "#0f172a" : "#f8fafc"
}

// Center label rendered inside the donut hole
function CenterLabel({
  cx,
  cy,
  total,
}: {
  cx: number
  cy: number
  total: number
}) {
  return (
    <g>
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontSize: "2rem",
          fontWeight: 600,
          fill: "oklch(0.96 0 0)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontSize: "0.65rem",
          fontWeight: 500,
          fill: "oklch(0.64 0 0)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        clínicas
      </text>
    </g>
  )
}

// Custom tooltip for the slices
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { color: string } }>
}) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div
      style={{
        background: "oklch(0.195 0.004 286)",
        border: "1px solid oklch(0.27 0.006 286)",
        borderRadius: "0.5rem",
        padding: "0.5rem 0.75rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            display: "inline-block",
            width: "0.625rem",
            height: "0.625rem",
            borderRadius: "50%",
            background: entry.payload.color,
          }}
        />
        <span
          style={{
            fontSize: "0.75rem",
            color: "oklch(0.96 0 0)",
            fontWeight: 500,
          }}
        >
          {entry.name}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color: "oklch(0.64 0 0)",
            marginLeft: "0.25rem",
          }}
        >
          {entry.value}
        </span>
      </div>
    </div>
  )
}

// Custom legend
function CustomLegend({ data }: { data: StatusEntry[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem 1rem",
        justifyContent: "center",
        marginTop: "0.75rem",
      }}
    >
      {data.map((entry) => (
        <div
          key={entry.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "0.625rem",
              height: "0.625rem",
              borderRadius: "50%",
              background: entry.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "0.7rem",
              color: "oklch(0.64 0 0)",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            {entry.label}
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--primary)",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {entry.count}
          </span>
        </div>
      ))}
    </div>
  )
}

export function StatusDonut({ data, totalClinics }: StatusDonutProps) {
  // Empty state
  if (!data.length) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "180px",
          color: "oklch(0.64 0 0)",
          fontSize: "0.8rem",
        }}
      >
        Sem dados de status
      </div>
    )
  }

  // Suppress unused import warning (contrastText used in badges if needed)
  void contrastText

  return (
    <div style={{ width: "100%" }}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
            label={false}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
            {/* Center label via customized label */}
          </Pie>
          {/* Center total — rendered as a custom label prop via Recharts label slot */}
          <Pie
            data={[{ value: 1 }]}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={0}
            outerRadius={0}
            fill="transparent"
            strokeWidth={0}
            label={(props: { cx: number; cy: number }) => (
              <CenterLabel cx={props.cx} cy={props.cy} total={totalClinics} />
            )}
            labelLine={false}
            isAnimationActive={false}
          />
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <CustomLegend data={data} />
    </div>
  )
}
