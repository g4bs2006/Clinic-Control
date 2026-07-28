// Histórico de entregas dos relatórios ao grupo (notify_deliveries, 0068).
//
// Serve para responder "desde quando está quebrado?" — pergunta que ficou sem
// resposta na investigação de 28/07/2026, porque o único registro de envio era
// o do pg_net, descartado em ~6h.
import type { NotifyDeliveryStatus } from "@/lib/whatsapp/actions"

const TYPE_LABEL: Record<string, string> = {
  manha: "Manhã",
  noite: "Noite",
  contencao: "Contenção",
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

export function NotifyDeliveriesPanel({ status }: { status: NotifyDeliveryStatus }) {
  if (!status.lastAttempt) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum envio registrado ainda. O histórico começa no próximo relatório (9h ou 19h).
      </p>
    )
  }

  const ok = status.lastOk && !status.stale

  return (
    <div className="space-y-4">
      {/* Resumo — empilha no mobile, lado a lado a partir do sm */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
            ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          }`}
        >
          <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
          {ok ? "Entregando" : "Sem entrega recente"}
        </span>
        <span className="text-sm text-muted-foreground">
          {status.lastOk
            ? `última entrega bem-sucedida em ${fmt(status.lastOk.created_at)}`
            : "nenhuma entrega bem-sucedida registrada"}
        </span>
      </div>

      {/* Tentativas recentes. Rola sozinha no mobile em vez de espremer. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Quando</th>
              <th className="pb-2 font-medium">Tipo</th>
              <th className="pb-2 font-medium">Destinatários</th>
              <th className="pb-2 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {status.recent.map((d, i) => (
              <tr key={`${d.created_at}-${i}`} className="border-b border-border/50 last:border-0">
                <td className="py-2 whitespace-nowrap text-muted-foreground">{fmt(d.created_at)}</td>
                <td className="py-2">{TYPE_LABEL[d.type] ?? d.type}</td>
                <td className="py-2 text-muted-foreground">{d.recipients}</td>
                <td className="py-2">
                  {d.ok ? (
                    <span className="text-emerald-400">entregue</span>
                  ) : (
                    <span className="text-red-400" title={d.error ?? undefined}>
                      falhou{d.error ? ` — ${d.error.slice(0, 60)}` : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
