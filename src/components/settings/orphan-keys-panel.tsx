import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { type OrphanKeySpend } from "@/lib/openai-usage/actions"

function fmtUsd(v: number): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ddmm(iso: string): string {
  if (!iso) return "—"
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

/**
 * Gasto que está na fatura mas não pertence a nenhuma clínica no painel. Era o
 * ponto cego mais caro do monitor: uma key deletada na OpenAI queimou US$ 632
 * em julho/2026 sem aparecer em lugar nenhum.
 */
export function OrphanKeysPanel({
  orphans,
  yearMonth,
}: {
  orphans: OrphanKeySpend[]
  yearMonth: string
}) {
  const total = orphans.reduce((s, o) => s + o.costUsd, 0)

  if (!orphans.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Todo o gasto do mês está atribuído a alguma clínica. ✅
      </p>
    )
  }

  // Uma key sem uso nos últimos dias provavelmente foi deletada na OpenAI; uma
  // key ativa é só cadastro faltando. A ação é diferente, então separamos.
  const hoje = new Date().toISOString().slice(0, 10)
  const diasDesde = (d: string) =>
    d ? Math.round((Date.parse(hoje) - Date.parse(d)) / 86400_000) : 999

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">{fmtUsd(total)}</strong> gastos em {yearMonth} por{" "}
          {orphans.length} chave(s) sem clínica vinculada. Esse valor está na fatura mas não
          aparece no ranking de gastos nem gera alerta — vincule em{" "}
          <Link href="/clinicas" className="underline underline-offset-2">
            Clínicas
          </Link>{" "}
          › aba IA &amp; Custos.
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              <th className="pb-1.5 font-medium">Chave</th>
              <th className="pb-1.5 text-right font-medium">Gasto</th>
              <th className="pb-1.5 text-right font-medium">Requisições</th>
              <th className="pb-1.5 text-right font-medium">Último uso</th>
            </tr>
          </thead>
          <tbody>
            {orphans.map((o) => {
              const inativa = diasDesde(o.lastDay) > 3
              return (
                <tr key={o.apiKeyId} className="border-b border-border/30 last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="text-foreground">{o.name}</span>
                    {inativa && (
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[0.6rem] text-muted-foreground">
                        sem uso recente
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-foreground">
                    {fmtUsd(o.costUsd)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {o.requests.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {ddmm(o.lastDay)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
