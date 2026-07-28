"use client"

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

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function fmtBRL(value: number | null): string {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const CONFIANCA_CLS: Record<string, string> = {
  alta: "bg-red-500/15 text-red-400",
  media: "bg-amber-500/15 text-amber-400",
  baixa: "bg-zinc-500/15 text-zinc-400",
}

/** Bloco expandido: o post-mortem da IA sobre a conversa do grupo. */
function AnalysisPanel({ analysis }: { analysis: ChurnAnalysis | undefined }) {
  if (!analysis) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem análise ainda. Use <strong>Analisar</strong> para ler a conversa do grupo e levantar os
        motivos prováveis.
      </p>
    )
  }
  if (analysis.status === "rodando") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-teal-400" />
        Lendo a conversa do grupo e analisando… atualize a página em alguns instantes.
      </p>
    )
  }
  if (analysis.status === "erro") {
    return (
      <p className="text-sm text-red-400">
        Falhou: {analysis.error ?? "erro desconhecido"}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {analysis.summary && <p className="text-sm text-foreground">{analysis.summary}</p>}

      {analysis.reasons.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
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
                {r.evidencia && (
                  <span className="text-xs text-muted-foreground">— {r.evidencia}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.signals.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
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

      {analysis.quotes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            No grupo
          </p>
          <ul className="space-y-1.5">
            {analysis.quotes.map((q, i) => (
              <li
                key={i}
                className="border-l-2 border-border pl-2.5 text-sm italic text-muted-foreground"
              >
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {analysis.messages_used} mensagem(ns) dos últimos {analysis.window_days} dias
        {analysis.truncated && " (janela cortada por volume — período mais recente)"}
        {analysis.model && ` · ${analysis.model}`}
      </p>
    </div>
  )
}

interface ChurnTableProps {
  churns: ChurnRow[]
  analyses: Record<string, ChurnAnalysis>
}

export function ChurnTable({ churns: initialChurns, analyses }: ChurnTableProps) {
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  // Cópia local para remoção otimista (some da tabela na hora). Re-sincroniza
  // quando o servidor envia nova lista (padrão render-time, sem efeito).
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
            description: `${clinic} volta para a carteira ativa e o registro de churn é removido.`,
            confirmLabel: "Reativar",
          }
        : {
            title: "Excluir registro de churn?",
            description: `Remove só o registro de ${clinic}; a clínica continua arquivada.`,
            confirmLabel: "Excluir",
            destructive: true,
          },
    )
    if (!ok) return
    // Otimista: some da tabela na hora; reverte só se o servidor recusar.
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
      if (res.ok) {
        toast.success("Análise iniciada — leva alguns instantes.")
      } else {
        toast.error(res.error)
      }
    })
  }

  if (churns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhum desligamento registrado. Bom sinal — carteira 100% retida.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Clínica</th>
            <th className="py-2 px-3 font-semibold">Mês</th>
            <th className="py-2 px-3 font-semibold">Motivo</th>
            <th className="py-2 px-3 font-semibold">Observações</th>
            <th className="py-2 px-3 text-right font-semibold">Mensalidade</th>
            <th className="py-2 pl-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {churns.map((c) => {
            const analysis = analyses[c.id]
            const isOpen = expanded === c.id
            return (
              <Fragment key={c.id}>
            <tr className="border-b border-border/30 hover:bg-accent/40 align-top">
              <td className="py-2.5 pr-3">
                <Link href={`/clinicas/${c.clinic_id}`} className="text-brand-gradient hover:opacity-85 font-medium transition-opacity">
                  {c.clinic_name}
                </Link>
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap tabular-nums capitalize">
                {monthLabel(c.churn_month)}
              </td>
              <td className="py-2.5 px-3">{c.reason ?? "—"}</td>
              <td className="py-2.5 px-3 text-muted-foreground max-w-[280px]">
                {c.notes ?? "—"}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                {fmtBRL(c.lost_revenue)}
              </td>
              <td className="py-2.5 pl-3">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={isOpen ? "secondary" : "outline"}
                    title="Post-mortem da IA sobre a conversa do grupo"
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                  >
                    Análise
                    {analysis?.status === "concluido" && analysis.reasons.length > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({analysis.reasons.length})
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || analyzing === c.id}
                    title="Lê a conversa do grupo dos últimos 120 dias e levanta os motivos"
                    onClick={() => analyze(c.id)}
                  >
                    {analyzing === c.id ? "Iniciando…" : analysis ? "Reanalisar" : "Analisar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    title="Remove o registro e devolve a clínica à carteira ativa"
                    onClick={() => remove(c.id, true)}
                  >
                    Reativar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    title="Remove só o registro (clínica continua arquivada)"
                    onClick={() => remove(c.id, false)}
                  >
                    Excluir
                  </Button>
                </div>
              </td>
            </tr>
            {isOpen && (
              <tr className="border-b border-border/30 bg-accent/20">
                <td colSpan={6} className="px-3 py-3">
                  <AnalysisPanel analysis={analysis} />
                </td>
              </tr>
            )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
