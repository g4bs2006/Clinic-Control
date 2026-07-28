"use client"

// Detalhe de um desligamento — o post-mortem inteiro, fora da lista.
//
// Mesmo padrão do detalhe de tarefa (TaskDetailDialog): um único componente que
// é DIÁLOGO quando aberto do registro e PÁGINA em /churns/[id]. O modo página dá
// URL ao post-mortem, então dá para mandar o link de uma saída específica.
//
// A organização segue a forma de um argumento, em três camadas de peso visual
// diferente — a versão anterior empilhava seis seções com o mesmo rótulo
// uppercase, e quando tudo é anunciado igual nada lidera:
//   1. VEREDITO   — o resumo, sem rótulo e em corpo maior. É a primeira coisa
//                   do diálogo; não precisa de placa dizendo o que é.
//   2. RACIOCÍNIO — os motivos, com a confiança como filete de 2px em vez de
//                   pílula. A pílula tinha mais peso visual que a frase que
//                   qualificava; o filete qualifica sem competir e ainda alinha
//                   os motivos numa coluna.
//   3. EVIDÊNCIA  — sinais e citações lado a lado: são a mesma camada (matéria
//                   -prima) e juntá-las usa a largura em vez de esticar o rolo.
//
// Os sinais viram linha do tempo porque SÃO uma sequência datada — o trilho
// codifica algo verdadeiro do conteúdo, não é ornamento.

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

/** Cor do filete de confiança. Mesma família dos acentos do sistema. */
const CONFIANCA_COLOR: Record<string, string> = {
  alta: "oklch(0.7 0.19 22)", // rose — perda
  media: "oklch(0.79 0.15 75)", // âmbar
  baixa: "oklch(0.55 0.02 260)", // zinc
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
    <p className="mb-3 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
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
  const done = analysis?.status === "concluido"

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

  // ── Cabeçalho: identifica a saída sem repetir o peso da análise ────────────
  const header = (
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-8">
        <h2 className={asPage ? "brand-header text-2xl font-bold" : "text-lg font-semibold"}>
          {churn.clinic_name}
        </h2>
        <Link
          href={`/clinicas/${churn.clinic_id}`}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          ver clínica ›
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="capitalize">{monthLabel(churn.churn_month)}</span> ·{" "}
        {churn.reason ?? "sem motivo"}
      </p>
      {diverges && (
        <p className="mt-1 flex items-start gap-2 text-sm text-amber-400">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            Registrado como “Outro” — a conversa aponta: {topReason?.motivo}
          </span>
        </p>
      )}
      {churn.notes && <p className="mt-1.5 text-sm text-foreground">{churn.notes}</p>}
    </header>
  )

  // ── Corpo: veredito → raciocínio → evidência ───────────────────────────────
  const content = (
    <div className="flex flex-col gap-6">
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

      {done && (
        <>
          {/* 1. Veredito — sem rótulo, corpo maior: lidera por tipografia. */}
          {analysis.summary && (
            <p className="text-base leading-relaxed text-foreground">{analysis.summary}</p>
          )}

          {/* 2. Raciocínio — confiança como filete, não como pílula. */}
          {analysis.reasons.length > 0 && (
            <ul className="flex flex-col gap-3.5">
              {analysis.reasons.map((r, i) => (
                <li
                  key={i}
                  className="border-l-2 pl-3"
                  style={{
                    borderColor: CONFIANCA_COLOR[r.confianca ?? "baixa"] ?? CONFIANCA_COLOR.baixa,
                  }}
                >
                  <p className="text-sm font-medium text-foreground">{r.motivo}</p>
                  {r.evidencia && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {r.evidencia}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* 3. Evidência — sinais e citações são a mesma camada. */}
          {(analysis.signals.length > 0 || analysis.quotes.length > 0) && (
            <div className="grid grid-cols-1 gap-6 border-t border-border/60 pt-5 md:grid-cols-2">
              {analysis.signals.length > 0 && (
                <section>
                  <SectionLabel>Sinais anteriores</SectionLabel>
                  {/* Linha do tempo: os sinais SÃO uma sequência datada. */}
                  <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                    {analysis.signals.map((s, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[1.3rem] top-1.5 size-1.5 rounded-full bg-muted-foreground" />
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {s.quando ?? "—"}
                        </p>
                        <p className="text-sm leading-snug text-foreground">{s.sinal}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {analysis.quotes.length > 0 && (
                <section>
                  <SectionLabel>No grupo</SectionLabel>
                  <ul className="flex flex-col gap-2.5">
                    {analysis.quotes.map((q, i) => (
                      <li
                        key={i}
                        className="border-l-2 pl-3 text-sm italic leading-snug text-foreground/90"
                        style={{ borderImage: "var(--brand) 1" }}
                      >
                        “{q}”
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  // ── Rodapé: proveniência à esquerda, ações à direita ───────────────────────
  const footer = (
    <footer
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3 ${
        // No diálogo o rodapé gruda: as ações não podem exigir que se atravesse
        // o post-mortem inteiro. Na página o fluxo é natural e não precisa.
        asPage ? "" : "sticky bottom-0 -mx-5 mt-1 bg-popover px-5 pb-1 sm:-mx-6 sm:px-6"
      }`}
    >
      <p className="text-xs text-muted-foreground">
        {done
          ? `${analysis.messages_used} mensagem(ns) · ${analysis.window_days} dias${
              analysis.truncated ? " · janela cortada" : ""
            }${analysis.model ? ` · ${analysis.model}` : ""}`
          : "sem análise"}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={analyze}>
          {analysis ? "Analisar de novo" : "Analisar conversa"}
        </Button>
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
          Excluir
        </Button>
      </div>
    </footer>
  )

  const body = (
    <div className="flex flex-col gap-5">
      {header}
      {content}
      {footer}
    </div>
  )

  if (asPage) return <div className="mx-auto max-w-4xl">{body}</div>

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">{body}</DialogContent>
    </Dialog>
  )
}
