"use client"

// Registro de saídas — o eixo é o tempo (trilho de mês à esquerda) e cada
// entrada carrega UMA linha de evidência: a frase apurada na conversa.
//
// A entrada é deliberadamente magra. A versão anterior empilhava nome, motivo,
// observações, citação, aviso de divergência, status e quatro botões, e ainda
// expandia o post-mortem inteiro ali dentro — informação de página inteira
// espremida numa fatia de lista. Agora clicar abre o detalhe (ChurnDetail), que
// é o mesmo componente de /churns/[id].
//
// A citação é o único lugar da página que usa o gradiente da marca, e como
// filete de 2px — a marca aponta para a evidência, não decora a linha.

import { useState } from "react"
import { ChevronRightIcon } from "lucide-react"
import { ChurnDetail } from "./churn-detail"
import type { ChurnRow, ChurnAnalysis } from "@/lib/churns/actions"

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

/** A linha de evidência: uma só, truncada. O resto vive no detalhe. */
function EvidenceLine({ analysis }: { analysis: ChurnAnalysis | undefined }) {
  if (!analysis) {
    return <span className="text-sm text-muted-foreground">sem análise ainda</span>
  }
  if (analysis.status === "rodando") {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-teal-400" />
        lendo a conversa do grupo…
      </span>
    )
  }
  if (analysis.status === "erro") {
    return <span className="text-sm text-red-400">análise falhou</span>
  }
  const quote = analysis.quotes?.[0] ?? analysis.reasons?.[0]?.motivo
  if (!quote) return <span className="text-sm text-muted-foreground">sem conclusão na conversa</span>
  return (
    <span
      className="block truncate border-l-2 pl-3 text-sm italic text-foreground/90"
      style={{ borderImage: "var(--brand) 1" }}
    >
      “{quote}”
    </span>
  )
}

interface ChurnLedgerProps {
  churns: ChurnRow[]
  analyses: Record<string, ChurnAnalysis>
}

export function ChurnLedger({ churns: initialChurns, analyses }: ChurnLedgerProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  // Cópia local para remoção otimista (some da lista na hora); re-sincroniza
  // quando o servidor manda lista nova (padrão render-time, sem efeito).
  const [churns, setChurns] = useState(initialChurns)
  const [prevChurns, setPrevChurns] = useState(initialChurns)
  if (prevChurns !== initialChurns) {
    setPrevChurns(initialChurns)
    setChurns(initialChurns)
  }

  const open = churns.find((c) => c.id === openId)

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
            {/* Trilho do mês — a assinatura da página. Sticky no desktop para a
                referência temporal acompanhar a leitura. */}
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
            <div className="min-w-0 flex-1 border-l border-border pl-2 sm:pl-4">
              {rows.map((c) => {
                const analysis = analyses[c.id]
                const diverges =
                  c.reason === "Outro" &&
                  analysis?.status === "concluido" &&
                  !!analysis.reasons?.[0]?.motivo

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    className="group flex w-full items-center gap-3 border-b border-border/40 px-2 py-3.5 text-left transition-colors last:border-0 hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          {diverges && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-amber-400"
                              title="O motivo registrado não bate com a conversa"
                            />
                          )}
                          {c.clinic_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.reason ?? "sem motivo"}
                        </span>
                      </div>
                      <div className="mt-1.5 min-w-0">
                        <EvidenceLine analysis={analysis} />
                      </div>
                    </div>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {open && (
        <ChurnDetail
          churn={open}
          analysis={analyses[open.id]}
          onClose={() => setOpenId(null)}
          onRemoved={(id) => setChurns((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
    </div>
  )
}
