"use client"

import { useState } from "react"
import Link from "next/link"
import type { PortfolioRow } from "@/lib/portfolio/aggregate"

interface RankingTableProps {
  rows: PortfolioRow[]
}

type SortKey = "rate" | "leads" | "scheduled"

// Luminance-based contrast: decide white or dark text on a given hex background
function contrastText(hex: string): string {
  const clean = hex.replace("#", "")
  if (clean.length !== 6) return "#f8fafc"
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.35 ? "#0f172a" : "#f8fafc"
}

function formatRate(rate: number): string {
  // rate is a fraction 0..1; display as a percentage (e.g. 0.125 → "12,5%")
  return (rate * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
}

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR")
}

const EM_DASH = "—"

// Sort indicator
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: "0.25rem",
        fontSize: "0.65rem",
        opacity: active ? 1 : 0.3,
        color: "oklch(0.62 0.20 292)",
      }}
    >
      {active ? (asc ? "▲" : "▼") : "▼"}
    </span>
  )
}

export function RankingTable({ rows }: RankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rate")
  const [sortAsc, setSortAsc] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = a[sortKey]
    const vb = b[sortKey]
    return sortAsc ? va - vb : vb - va
  })

  if (sorted.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1rem",
          color: "oklch(0.64 0 0)",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "1.5rem", opacity: 0.4 }}>—</span>
        <span style={{ fontSize: "0.8rem" }}>Nenhuma clínica encontrada</span>
        <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>
          Tente ajustar o filtro de região ou mês.
        </span>
      </div>
    )
  }

  const thStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    fontSize: "0.65rem",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "oklch(0.64 0 0)",
    textAlign: "left",
    borderBottom: "1px solid oklch(0.27 0.006 286)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }

  const thSortStyle: React.CSSProperties = {
    ...thStyle,
    cursor: "pointer",
  }

  const tdStyle: React.CSSProperties = {
    padding: "0.625rem 0.75rem",
    fontSize: "0.8rem",
    color: "oklch(0.96 0 0)",
    borderBottom: "1px solid oklch(0.235 0 0)",
    verticalAlign: "middle",
  }

  const tdMutedStyle: React.CSSProperties = {
    ...tdStyle,
    color: "oklch(0.64 0 0)",
    fontVariantNumeric: "tabular-nums",
  }

  const tdNumStyle: React.CSSProperties = {
    ...tdStyle,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Clínica</th>
            <th style={thStyle}>Cidade / UF</th>
            <th
              style={thSortStyle}
              onClick={() => handleSort("leads")}
              title="Ordenar por leads"
            >
              Leads
              <SortIcon active={sortKey === "leads"} asc={sortAsc} />
            </th>
            <th
              style={thSortStyle}
              onClick={() => handleSort("scheduled")}
              title="Ordenar por agendados"
            >
              Agendados
              <SortIcon active={sortKey === "scheduled"} asc={sortAsc} />
            </th>
            <th
              style={{ ...thSortStyle, textAlign: "right" }}
              onClick={() => handleSort("rate")}
              title="Ordenar por taxa"
            >
              Taxa
              <SortIcon active={sortKey === "rate"} asc={sortAsc} />
            </th>
            <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isNone = row.source === "none"
            const cityUf =
              row.city || row.state
                ? [row.city, row.state].filter(Boolean).join("/")
                : null

            return (
              <tr
                key={row.clinicId}
                style={{
                  background:
                    i % 2 === 0
                      ? "transparent"
                      : "oklch(0.178 0 0 / 0.6)",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLTableRowElement).style.background =
                    "oklch(0.24 0.006 286 / 0.9)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLTableRowElement).style.background =
                    i % 2 === 0
                      ? "transparent"
                      : "oklch(0.178 0 0 / 0.6)"
                }}
              >
                {/* Clinic name — links to detail */}
                <td style={tdStyle}>
                  <Link
                    href={`/clinicas/${row.clinicId}`}
                    style={{
                      color: "oklch(0.62 0.20 292)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLAnchorElement).style.textDecoration =
                        "underline"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLAnchorElement).style.textDecoration =
                        "none"
                    }}
                  >
                    {row.name}
                  </Link>
                </td>

                {/* City / UF */}
                <td style={tdMutedStyle}>{cityUf ?? EM_DASH}</td>

                {/* Leads */}
                <td style={tdNumStyle}>
                  {isNone ? EM_DASH : formatNumber(row.leads)}
                </td>

                {/* Scheduled */}
                <td style={tdNumStyle}>
                  {isNone ? EM_DASH : formatNumber(row.scheduled)}
                </td>

                {/* Rate */}
                <td style={{ ...tdNumStyle, fontWeight: 600 }}>
                  {isNone ? EM_DASH : formatRate(row.rate)}
                </td>

                {/* Status badge */}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {row.status && row.statusColor ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.1875rem 0.625rem",
                        borderRadius: "9999px",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        background: row.statusColor,
                        color: contrastText(row.statusColor),
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.status}
                    </span>
                  ) : (
                    <span style={{ color: "oklch(0.64 0 0)", fontSize: "0.75rem" }}>
                      {EM_DASH}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
