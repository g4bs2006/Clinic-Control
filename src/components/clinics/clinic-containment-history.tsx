import { ShieldCheck, ShieldAlert, CircleSlash, Eye, XCircle } from "lucide-react"
import { type ContainmentRun, type ContainmentAction } from "@/lib/openai-usage/actions"

function fmtUsd(v: number): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ddmm(iso: string): string {
  if (!iso) return "—"
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

const OUTCOME: Record<
  ContainmentAction["outcome"],
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  concluida: { label: "Concluída", className: "text-emerald-400", Icon: ShieldCheck },
  simulada: { label: "Seria concluída", className: "text-amber-400", Icon: Eye },
  poupada: { label: "Mantida", className: "text-muted-foreground", Icon: CircleSlash },
  falhou: { label: "Falhou", className: "text-red-400", Icon: XCircle },
}

/**
 * Histórico do que a contenção automática fez nesta clínica. Existe para que
 * uma conversa fechada por robô nunca seja um mistério: mostra a decisão, o
 * motivo e os números que a sustentaram no momento em que foi tomada.
 */
export function ClinicContainmentHistory({ runs }: { runs: ContainmentRun[] }) {
  if (!runs.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma contenção nesta clínica. Ela só é acionada quando o gasto diário de IA estoura o
        limite configurado.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {runs.map((run) => (
        <div key={run.id} className="flex flex-col gap-2 border-b border-border/40 pb-4 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {run.status === "erro" ? (
              <ShieldAlert className="size-4 text-red-400" />
            ) : (
              <ShieldCheck className="size-4 text-emerald-400" />
            )}
            <span className="text-sm font-medium text-foreground">
              {ddmm(run.day)} · {fmtUsd(run.costUsd)}
            </span>
            {run.dryRun && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-amber-400">
                simulação
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {run.sessionsScanned} conversa(s) varrida(s) · {run.suspectsFound} em loop ·{" "}
              {run.sessionsClosed} fechada(s)
            </span>
          </div>

          {run.status === "erro" && (
            <p className="text-xs text-red-400">Falhou: {run.error ?? "erro desconhecido"}</p>
          )}

          {run.actions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {run.actions.map((a) => {
                const { label, className, Icon } = OUTCOME[a.outcome]
                return (
                  <li
                    key={`${run.id}-${a.sessionId}`}
                    className="flex flex-col gap-0.5 rounded-md bg-accent/20 px-2.5 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Icon className={`size-3.5 shrink-0 ${className}`} />
                      <span className={`text-[0.7rem] font-medium uppercase tracking-wider ${className}`}>
                        {label}
                      </span>
                      <span className="text-sm text-foreground">{a.contactName}</span>
                      {a.contactPhone && (
                        <span className="text-xs text-muted-foreground">{a.contactPhone}</span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{a.reason}</p>
                    <p className="text-[0.65rem] tabular-nums text-muted-foreground/70">
                      {Math.round(a.dupRatio * 100)}% repetição · {a.msgsIa} msgs da IA ·{" "}
                      {a.msgsPaciente} do contato · {a.activeHours}h ativas
                    </p>
                    {a.error && <p className="text-[0.65rem] text-red-400">{a.error}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
