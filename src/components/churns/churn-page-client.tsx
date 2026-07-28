"use client"

// Wrapper client de /churns/[id]: reaproveita o corpo do detalhe em modo
// `asPage`. Fechar e remover navegam de volta ao registro — aqui não há lista
// para sincronizar. Mesmo desenho do TaskPageClient.

import { useRouter } from "next/navigation"
import { ChurnDetail } from "./churn-detail"
import type { ChurnRow, ChurnAnalysis } from "@/lib/churns/actions"

export function ChurnPageClient({
  churn,
  analysis,
}: {
  churn: ChurnRow
  analysis: ChurnAnalysis | null
}) {
  const router = useRouter()
  return (
    <ChurnDetail
      asPage
      churn={churn}
      analysis={analysis ?? undefined}
      onClose={() => router.push("/churns")}
      onRemoved={() => router.push("/churns")}
    />
  )
}
