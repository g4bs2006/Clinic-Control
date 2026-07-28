"use client"

// Detalhe de um desligamento — o post-mortem inteiro, fora da lista.
//
// Mesmo padrão do detalhe de tarefa (TaskDetailDialog): um único componente que
// é DIÁLOGO quando aberto do registro e PÁGINA em /churns/[id]. O modo página dá
// URL ao post-mortem, então dá para mandar o link de uma saída específica.
//
// Tudo que pesava na linha da lista mora aqui: motivos, sinais, citações,
// metadados e as ações destrutivas — que ficam no rodapé, longe da leitura.

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  removeChurn,
  requestChurnAnalysis,
  type ChurnRow,
  type ChurnAnalysis,
} from "@/lib/churns/actions"

const CONFIANCA_CLS: Record<string, string> = {
  alta: "bg-red-500/15 text-red-400",
  media: "bg-amber-500/15 text-amber-400",
  baixa: "bg-zinc-500/15 text-zinc-400",
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </p>
  )
}

interface ChurnDetailProps {
  churn: ChurnRow
  analysis?: ChurnAnalysis
  /** true = layout de página (/churns/[id]); false = diálogo sobre a lista. */
  asPage?: boolean
  onClose: () => void
  /** Chamado após remover — a lista some com a entrada; a página navega. */
  onRemoved?: (id: string) => void
}

export function ChurnDetail({ churn, analysis, asPage = false, onClose, onRemoved }: ChurnDetailProps) {
  const confirm = useConfirm()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const topReason = analysis?.reasons?.[0]
  const diverges = churn.reason === "Outro" && analysis?.status === "concluido" && !!topReason?.motivo

  function analyze() {
    startTransition(async () => {
      const res = await requestChurnAnalysis(churn.id)
      if (res.ok) {
        toast.success("Analisando a conversa do grupo.")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  async function remove(reactivate: boolean) {
    const ok = await confirm(
      reactivate
        ? {
            title: "Reativar clínica?",
            description: `${churn.clinic_name} volta para a carteira ativa e o registro de desligamento é removido.`,
            confirmLabel: "Reativar",
          }
        : {
            title: "Excluir registro?",
            description: `Remove só o registro de ${churn.clinic_name}; a clínica continua arquivada.`,
            confirmLabel: "Excluir",
            destructive: true,
          },
    )
    if (!ok) return
    startTransition(async () => {
      const res = await removeChurn(churn.id, reactivate)
      if (res.ok) {
        toast.success(reactivate ? "Registro removido e clínica reativada." : "Registro removido.")
        onRemoved?.(churn.id)
        onClose()
      } else {
        toast.error(res.error)
      }
    })
  }

  const body = (
    <div className="flex flex-col gap-5">
      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-1">
        {asPage && (
          <Link
            href="/churns"
            className="mb-1 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Churns
          </Link>
        )}
        <h2 className={asPage ? "text-2xl font-bold brand-header" : "text-lg font-semibold"}>
          {churn.clinic_name}
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{monthLabel(churn.churn_month)}</span>
          {" · "}
          {churn.reason ?? "sem motivo"}
          {" · "}
          <Link href={`/clinicas/${churn.clinic_id}`} className="underline-offset-4 hover:underline">
            ver clínica
          </Link>
        </p>
        {churn.notes && <p className="mt-1 text-sm text-foreground">{churn.notes}</p>}
      </header>

      {/* ── Post-mortem ───────────────────────────────────────── */}
      {!analysis && (
        <p className="text-sm text-muted-foreground">
          A conversa do grupo ainda não foi analisada.
        </p>
      )}

      {analysis?.status === "rodando" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-teal-400" />
          Lendo a conversa do grupo… atualize em alguns instantes.
        </p>
      )}

      {analysis?.status === "erro" && (
        <p className="text-sm text-red-400">
          A análise falhou: {analysis.error ?? "erro desconhecido"}
        </p>
      )}

      {analysis?.status === "concluido" && (
        <div className="flex flex-col gap-5">
          {diverges && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              Registrado como “Outro”, mas a conversa aponta: {topReason?.motivo}
            </p>
          )}

          {analysis.summary && (
            <p className="text-[0.95rem] leading-relaxed text-foreground">{analysis.summary}</p>
          )}

          {analysis.reasons.length > 0 && (
            <section>
              <SectionLabel>Motivos prováveis</SectionLabel>
              <ul className="flex flex-col gap-2.5">
                {analysis.reasons.map((r, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase ${
                          CONFIANCA_CLS[r.confianca ?? "baixa"] ?? CONFIANCA_CLS.baixa
                        }`}
                      >
                        {r.confianca ?? "baixa"}
                      </span>
                      <span className="text-sm font-medium text-foreground">{r.motivo}</span>
                    </div>
                    {r.evidencia && (
                      <p className="text-xs leading-relaxed text-muted-foreground">{r.evidencia}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {analysis.signals.length > 0 && (
            <section>
              <SectionLabel>Sinais anteriores</SectionLabel>
              <ul className="flex flex-col gap-1.5">
                {analysis.signals.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {s.quando ?? "—"}
                    </span>
                    <span className="text-foreground">{s.sinal}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {analysis.quotes.length > 0 && (
            <section>
              <SectionLabel>No grupo</SectionLabel>
              <ul className="flex flex-col gap-2">
                {analysis.quotes.map((q, i) => (
                  <li
                    key={i}
                    className="border-l-2 pl-3 text-sm italic text-foreground/90"
                    style={{ borderImage: "var(--brand) 1" }}
                  >
                    “{q}”
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            {analysis.messages_used} mensagem(ns) dos últimos {analysis.window_days} dias
            {analysis.truncated && " · janela cortada por volume"}
            {analysis.model && ` · ${analysis.model}`}
          </p>
        </div>
      )}

      {/* ── Ações ─────────────────────────────────────────────── */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={analyze}>
          {analysis ? "Analisar de novo" : "Analisar conversa"}
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => remove(true)}
          >
            Reativar clínica
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            className="text-red-400 hover:text-red-400"
            onClick={() => remove(false)}
          >
            Excluir registro
          </Button>
        </div>
      </footer>
    </div>
  )

  if (asPage) return <div className="mx-auto max-w-3xl">{body}</div>

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">{body}</DialogContent>
    </Dialog>
  )
}
