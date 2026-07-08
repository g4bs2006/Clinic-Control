"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ALL = "__all__"

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

  function navigate(
    newMonth: string,
    newRegion: string | null | undefined,
  ) {
    const params = new URLSearchParams()
    params.set("month", newMonth)
    if (newRegion && newRegion !== ALL) params.set("region", newRegion)
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      {/* Month selector */}
      <Select
        value={month}
        items={Object.fromEntries(monthOptions.map((o) => [o.key, o.label]))}
        onValueChange={(val) => navigate(val ?? month, region)}
      >
        <SelectTrigger className="h-8 text-sm min-w-[9rem]">
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

      {/* Region filter — only show if there are distinct regions */}
      {regions.length > 0 && (
        <Select
          value={region || ALL}
          items={{
            [ALL]: "Todas as regiões",
            ...Object.fromEntries(regions.map((r) => [r, r])),
          }}
          onValueChange={(val) => navigate(month, val)}
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
      )}
    </div>
  )
}
