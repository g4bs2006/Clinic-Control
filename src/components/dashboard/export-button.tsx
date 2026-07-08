"use client"

import { Download } from "lucide-react"

export interface ExportRow {
  name: string
  location: string
  region: string
  mode: string
  contractStatus: string
  leads: number
  scheduled: number
  rate: string
  status: string
  revenue: string
  checklist: string
}

interface ExportButtonProps {
  data: ExportRow[]
  filename?: string
}

export function ExportButton({ data, filename = "relatorio-carteira" }: ExportButtonProps) {
  function downloadCSV() {
    if (data.length === 0) return

    // Define CSV headers
    const headers = [
      "Clinica",
      "Cidade/UF",
      "Regiao",
      "Modo",
      "Status Contrato",
      "Leads",
      "Agendados",
      "Taxa Conversao",
      "Status Desempenho",
      "Faturamento",
      "Checklist",
    ]

    // Convert rows to CSV strings
    const csvRows = [
      headers.join(";"), // Use semicolon for better default compatibility in Excel/Sheets in BR/PT locales
      ...data.map((row) =>
        [
          `"${row.name.replace(/"/g, '""')}"`,
          `"${row.location.replace(/"/g, '""')}"`,
          `"${row.region.replace(/"/g, '""')}"`,
          `"${row.mode}"`,
          `"${row.contractStatus}"`,
          row.leads,
          row.scheduled,
          `"${row.rate}"`,
          `"${row.status}"`,
          `"${row.revenue}"`,
          `"${row.checklist}"`,
        ].join(";"),
      ),
    ]

    const csvContent = "\uFEFF" + csvRows.join("\n") // Add UTF-8 BOM for correct characters (like ã, ó, é) in Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `${filename}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={downloadCSV}
      title="Exportar dados da carteira"
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
    >
      <Download className="size-3.5" />
      <span>Exportar</span>
    </button>
  )
}
