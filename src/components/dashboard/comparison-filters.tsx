"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ComparisonFiltersProps {
  /** Current number of months in the window */
  range: number
}

const RANGE_OPTIONS = [
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
]

export function ComparisonFilters({ range }: ComparisonFiltersProps) {
  const router = useRouter()

  return (
    <Select
      value={String(range)}
      onValueChange={(val) => router.push(`/comparativo?range=${val ?? range}`)}
    >
      <SelectTrigger className="h-8 text-sm min-w-[11rem]">
        <SelectValue>
          {(val) =>
            RANGE_OPTIONS.find((o) => o.value === String(val))?.label ??
            String(val ?? "")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
