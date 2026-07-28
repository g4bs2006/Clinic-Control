import { notFound } from "next/navigation"
import { getChurnDetail } from "@/lib/churns/actions"
import { ChurnPageClient } from "@/components/churns/churn-page-client"

export const dynamic = "force-dynamic"

/**
 * Deep-link do post-mortem. Existe para o detalhe ter URL própria: dá para
 * mandar o link de uma saída específica numa tarefa ou numa conversa, em vez de
 * mandar "abre /churns e procura a clínica X".
 */
export default async function ChurnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getChurnDetail(id)
  if (!detail) notFound()

  return (
    <main className="mx-auto max-w-screen-xl space-y-6 p-4 sm:p-6">
      <ChurnPageClient churn={detail.churn} analysis={detail.analysis} />
    </main>
  )
}
