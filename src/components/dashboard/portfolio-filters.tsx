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
  /** Carteira selecionada (id do desenvolvedor) — null = todas */
  developer?: string | null
  /** Desenvolvedores para o filtro de carteira — só o gestor recebe a lista */
  developers?: { id: string; name: string }[]
  /** Route the filters navigate to (so the same control works on / and /mapa) */
  basePath?: string
}

export function PortfolioFilters({
  month,
  region,
  regions,
  monthOptions,
  developer = null,
  developers = [],
  basePath = "/",
}: PortfolioFiltersProps) {
  const router = useRouter()

  function navigate(
    newMonth: string,
    newRegion: string | null | undefined,
    newDeveloper: string | null | undefined,
  ) {
    const params = new URLSearchParams()
    params.set("month", newMonth)
    if (newRegion && newRegion !== ALL) params.set("region", newRegion)
    if (newDeveloper && newDeveloper !== ALL) params.set("dev", newDeveloper)
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      {/* Month selector */}
      <Select
        value={month}
        items={Object.fromEntries(monthOptions.map((o) => [o.key, o.label]))}
        onValueChange={(val) => navigate(val ?? month, region, developer)}
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

      {/* Carteira filter — only for gestores (developers list provided) */}
      {developers.length > 0 && (
        <Select
          value={developer || ALL}
          items={{
            [ALL]: "Todas as carteiras",
            ...Object.fromEntries(developers.map((d) => [d.id, d.name])),
          }}
          onValueChange={(val) => navigate(month, region, val)}
        >
          <SelectTrigger className="h-8 text-sm min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as carteiras</SelectItem>
            {developers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Region filter — only show if there are distinct regions */}
      {regions.length > 0 && (
        <Select
          value={region || ALL}
          items={{
            [ALL]: "Todas as regiões",
            ...Object.fromEntries(regions.map((r) => [r, r])),
          }}
          onValueChange={(val) => navigate(month, val, developer)}
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
