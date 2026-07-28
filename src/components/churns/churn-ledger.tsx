"use client"

// Registro de saídas — substitui a tabela de churns.
//
// A tabela tratava cada desligamento como uma linha de dados entre outras, e
// escondia atrás de um botão a única coisa que explica o churn: o que o cliente
// disse. Aqui o eixo é o tempo (trilho de mês à esquerda) e cada saída carrega
// a frase apurada na conversa, impressa na própria entrada.
//
// A citação é o único lugar da página que usa o gradiente da marca, e como
// filete de 2px — a marca aponta para a evidência, não decora o cartão.

import { Fragment, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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

function monthLabel(key: string): { mes: string; ano: string } {
  const [y, m] = key.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return {
    mes: d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", ""),
    ano: String(y),
  }
}

/** Agrupa por churn_month preservando a ordem (a query já vem desc). */
function groupByMonth(churns: ChurnRow[]): [string, ChurnRow[]][] {
  const map = new Map<string, ChurnRow[]>()
  for (const c of churns) {
    const list = map.get(c.churn_month) ?? []
    list.push(c)
    map.set(c.churn_month, list)
  }
  return [...map.entries()]
}

/** Post-mortem completo, revelado ao expandir a entrada. */
function AnalysisDetail({ analysis }: { analysis: ChurnAnalysis }) {
  return (
    <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
      {analysis.summary && <p className="text-sm text-foreground">{analysis.summary}</p>}

      {analysis.reasons.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Motivos prováveis
          </p>
          <ul className="space-y-1.5">
            {analysis.reasons.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase ${
                    CONFIANCA_CLS[r.confianca ?? "baixa"] ?? CONFIANCA_CLS.baixa
                  }`}
                >
                  {r.confianca ?? "baixa"}
                </span>
                <span className="text-foreground">{r.motivo}</span>
                {r.evidencia && <span className="text-xs text-muted-foreground">— {r.evidencia}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.signals.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Sinais anteriores
          </p>
          <ul className="space-y-1 text-sm">
            {analysis.signals.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground">{s.quando ?? "—"}</span>
                <span className="text-foreground">{s.sinal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.quotes.length > 1 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            No grupo
          </p>
          <ul className="space-y-1.5">
            {analysis.quotes.slice(1).map((q, i) => (
              <li key={i} className="border-l-2 border-border pl-2.5 text-sm italic text-muted-foreground">
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {analysis.messages_used} mensagem(ns) dos últimos {analysis.window_days} dias
        {analysis.truncated && " · janela cortada por volume"}
        {analysis.model && ` · ${analysis.model}`}
      </p>
    </div>
  )
}

interface ChurnLedgerProps {
  churns: ChurnRow[]
  analyses: Record<string, ChurnAnalysis>
}

export function ChurnLedger({ churns: initialChurns, analyses }: ChurnLedgerProps) {
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  // Cópia local para remoção otimista (some da lista na hora); re-sincroniza
  // quando o servidor manda lista nova (padrão render-time, sem efeito).
  const [churns, setChurns] = useState(initialChurns)
  const [prevChurns, setPrevChurns] = useState(initialChurns)
  if (prevChurns !== initialChurns) {
    setPrevChurns(initialChurns)
    setChurns(initialChurns)
  }

  async function remove(id: string, reactivate: boolean) {
    const c = churns.find((x) => x.id === id)
    const clinic = c?.clinic_name ?? "esta clínica"
    const ok = await confirm(
      reactivate
        ? {
            title: "Reativar clínica?",
            description: `${clinic} volta para a carteira ativa e o registro de desligamento é removido.`,
            confirmLabel: "Reativar",
          }
        : {
            title: "Excluir registro?",
            description: `Remove só o registro de ${clinic}; a clínica continua arquivada.`,
            confirmLabel: "Excluir",
            destructive: true,
          },
    )
    if (!ok) return
    const snapshot = churns
    setChurns((prev) => prev.filter((x) => x.id !== id))
    startTransition(async () => {
      const res = await removeChurn(id, reactivate)
      if (res.ok) {
        toast.success(reactivate ? "Registro removido e clínica reativada." : "Registro removido.")
      } else {
        setChurns(snapshot)
        toast.error(res.error)
      }
    })
  }

  function analyze(id: string) {
    setAnalyzing(id)
    setExpanded(id)
    startTransition(async () => {
      const res = await requestChurnAnalysis(id)
      setAnalyzing(null)
      if (res.ok) toast.success("Analisando a conversa do grupo.")
      else toast.error(res.error)
    })
  }

  if (churns.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum desligamento registrado. Bom sinal — carteira 100% retida.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {groupByMonth(churns).map(([month, rows]) => {
        const { mes, ano } = monthLabel(month)
        return (
          <div key={month} className="flex gap-4 sm:gap-6">
            {/* Trilho do mês — a assinatura da página. Sticky no desktop para
                a referência temporal acompanhar a leitura. */}
            <div className="w-14 shrink-0 pt-4 sm:w-20 lg:sticky lg:top-4 lg:self-start">
              <p className="text-2xl font-semibold capitalize leading-none tabular-nums text-foreground sm:text-3xl">
                {mes}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{ano}</p>
              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {rows.length} {rows.length === 1 ? "saída" : "saídas"}
              </p>
            </div>

            {/* Entradas do mês, penduradas numa régua vertical */}
            <div className="min-w-0 flex-1 border-l border-border pl-4 sm:pl-6">
              {rows.map((c) => {
                const analysis = analyses[c.id]
                const isOpen = expanded === c.id
                const topQuote = analysis?.quotes?.[0]
                const topReason = analysis?.reasons?.[0]
                // Divergência conservadora: só acusa quando o gestor escolheu
                // "Outro" (que não diz nada) e a IA achou algo. Comparar textos
                // livres com os motivos da lista fechada geraria alarme falso.
                const diverges =
                  c.reason === "Outro" && analysis?.status === "concluido" && !!topReason?.motivo

                return (
                  <Fragment key={c.id}>
                    <div className="border-b border-border/40 py-4 last:border-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <Link
                          href={`/clinicas/${c.clinic_id}`}
                          className="text-brand-gradient font-medium transition-opacity hover:opacity-85"
                        >
                          {c.clinic_name}
                        </Link>
                        <span className="text-xs text-muted-foreground">{c.reason ?? "sem motivo"}</span>
                      </div>

                      {c.notes && <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p>}

                      {/* A frase do cliente — o coração da entrada */}
                      {topQuote && (
                        <blockquote
                          className="mt-2.5 border-l-2 pl-3 text-sm italic text-foreground/90"
                          style={{ borderImage: "var(--brand) 1" }}
                        >
                          “{topQuote}”
                        </blockquote>
                      )}

                      {diverges && (
                        <p className="mt-2 text-xs text-amber-400">
                          Registrado como “Outro” · a conversa aponta: {topReason?.motivo}
                        </p>
                      )}

                      {analysis?.status === "rodando" && (
                        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="size-1.5 animate-pulse rounded-full bg-teal-400" />
                          Lendo a conversa do grupo…
                        </p>
                      )}
                      {analysis?.status === "erro" && (
                        <p className="mt-2 text-xs text-red-400">
                          Análise falhou: {analysis.error ?? "erro desconhecido"}
                        </p>
                      )}

                      {isOpen && analysis?.status === "concluido" && (
                        <AnalysisDetail analysis={analysis} />
                      )}

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {analysis?.status === "concluido" && (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => setExpanded(isOpen ? null : c.id)}
                          >
                            {isOpen ? "Recolher" : "Ver análise"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={pending || analyzing === c.id}
                          onClick={() => analyze(c.id)}
                        >
                          {analyzing === c.id
                            ? "Iniciando…"
                            : analysis
                              ? "Analisar de novo"
                              : "Analisar conversa"}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => remove(c.id, true)}
                        >
                          Reativar
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => remove(c.id, false)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
