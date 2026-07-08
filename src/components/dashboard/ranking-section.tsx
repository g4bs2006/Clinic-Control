"use client"

import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Panel } from "@/components/dashboard/panel"
import { RankingTable } from "@/components/dashboard/ranking-table"
import { ExportButton, type ExportRow } from "@/components/dashboard/export-button"
import type { PortfolioRow } from "@/lib/portfolio/aggregate"

const ALL = "__all__"

/**
 * Ranking + filtro de região + exportar. A região é filtrada NO CLIENTE (todas
 * as linhas já vêm carregadas), então trocar de região é instantâneo — sem
 * round-trip ao servidor nem nova chamada à Helena.
 */
export function RankingSection({
  rows,
  regions,
  exportData,
  exportFilename,
}: {
  rows: PortfolioRow[]
  regions: string[]
  exportData: ExportRow[]
  exportFilename: string
}) {
  const [region, setRegion] = useState<string>(ALL)
  const activeRegion = region !== ALL && regions.includes(region) ? region : ""

  const filteredRows = activeRegion ? rows.filter((r) => r.region === activeRegion) : rows
  const filteredExport = activeRegion
    ? exportData.filter((r) => r.region === activeRegion)
    : exportData

  return (
    <Panel
      title="Ranking de clínicas"
      subtitle={
        activeRegion
          ? `ordenado por taxa · região ${activeRegion}`
          : "ordenado por taxa de agendamento"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {regions.length > 0 ? (
          <Select
            value={region}
            items={{
              [ALL]: "Todas as regiões",
              ...Object.fromEntries(regions.map((r) => [r, r])),
            }}
            onValueChange={(v) => setRegion(v ?? ALL)}
          >
            <SelectTrigger className="h-8 text-sm min-w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as regiões</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        <ExportButton data={filteredExport} filename={exportFilename} />
      </div>

      <RankingTable rows={filteredRows} />
    </Panel>
  )
}
