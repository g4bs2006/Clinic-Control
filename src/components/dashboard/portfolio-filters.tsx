"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface PortfolioFiltersProps {
  month: string
  region: string | null
  regions: string[]
  /** All YYYY-MM keys to offer in the month selector (last 12 months) */
  monthOptions: { key: string; label: string }[]
  /** Route the filters navigate to (so the same control works on / and /mapa) */
  basePath?: string
}

export function PortfolioFilters({
  month,
  region,
  regions,
  monthOptions,
  basePath = "/",
}: PortfolioFiltersProps) {
  const router = useRouter()

  function navigate(newMonth: string, newRegion: string | null | undefined) {
    const params = new URLSearchParams()
    params.set("month", newMonth)
    if (newRegion && newRegion !== "__all__") {
      params.set("region", newRegion)
    }
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      {/* Month selector */}
      <Select
        value={month}
        onValueChange={(val) => navigate(val ?? month, region)}
      >
        <SelectTrigger className="h-8 text-sm min-w-[9rem]">
          <SelectValue>
            {(val) =>
              monthOptions.find((o) => o.key === val)?.label ?? String(val ?? "")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((opt) => (
            <SelectItem key={opt.key} value={opt.key}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Region filter — only show if there are distinct regions */}
      {regions.length > 0 && (
        <Select
          value={region || "__all__"}
          onValueChange={(val) => navigate(month, val)}
        >
          <SelectTrigger className="h-8 text-sm min-w-[9rem]">
            <SelectValue>
              {(val) =>
                !val || val === "__all__" ? "Todas as regiões" : String(val)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as regiões</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
