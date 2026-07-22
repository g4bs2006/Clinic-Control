"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { removeChurn, type ChurnRow } from "@/lib/churns/actions"

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

interface ChurnTableProps {
  churns: ChurnRow[]
}

export function ChurnTable({ churns: initialChurns }: ChurnTableProps) {
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
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
          {churns.map((c) => (
            <tr key={c.id} className="border-b border-border/30 hover:bg-accent/40 align-top">
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
                <div className="flex justify-end gap-1.5">
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
