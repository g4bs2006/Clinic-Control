"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2, X, RotateCcw, Trash2, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  updateAcompanhamentoStatus,
  deleteAcompanhamento,
  type AcompanhamentoRow,
} from "@/lib/acompanhamentos/actions"

const SEVERITY_DOT: Record<AcompanhamentoRow["severity"], string> = {
  alta: "bg-red-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-400",
}

const SEVERITY_LABEL: Record<AcompanhamentoRow["severity"], string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
}

export function AcompanhamentosList({ initialItems }: { initialItems: AcompanhamentoRow[] }) {
  const [items, setItems] = useState(initialItems)
  const [pending, startTransition] = useTransition()
  const [showClosed, setShowClosed] = useState(false)

  const abertos = items.filter((a) => a.status === "aberto")
  const fechados = items.filter((a) => a.status !== "aberto")

  function setStatus(id: string, status: AcompanhamentoRow["status"]) {
    const snapshot = items
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    startTransition(async () => {
      const res = await updateAcompanhamentoStatus(id, status)
      if (!res.ok) {
        setItems(snapshot)
        toast.error(res.error)
      }
    })
  }

  function remove(id: string) {
    if (!confirm("Excluir este acompanhamento definitivamente?")) return
    const snapshot = items
    setItems((prev) => prev.filter((a) => a.id !== id))
    startTransition(async () => {
      const res = await deleteAcompanhamento(id)
      if (!res.ok) {
        setItems(snapshot)
        toast.error(res.error)
      } else {
        toast.success("Acompanhamento excluído.")
      }
    })
  }

  function Row({ a }: { a: AcompanhamentoRow }) {
    const closed = a.status !== "aberto"
    return (
      <li className={`flex flex-wrap items-start gap-3 py-3 ${closed ? "opacity-60" : ""}`}>
        <span
          className={`mt-1 size-2 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`}
          title={`Severidade: ${SEVERITY_LABEL[a.severity]}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${closed ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {a.title}
            {a.status === "resolvido" && (
              <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-400">
                Resolvido
              </span>
            )}
            {a.status === "dispensado" && (
              <span className="ml-2 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-zinc-400">
                Dispensado
              </span>
            )}
          </p>
          {a.description && (
            <p className="mt-0.5 text-xs italic text-muted-foreground/90">{a.description}</p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {a.clinic_id && a.clinic_name && (
              <Link href={`/clinicas/${a.clinic_id}`} className="hover:text-foreground transition-colors">
                {a.clinic_name}
              </Link>
            )}
            {a.assigned_to_name && <>· {a.assigned_to_name}</>}
            <>· aberto {dateLabel(a.created_at)}</>
            {a.source === "ia" && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-400">
                IA
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {a.status === "aberto" ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setStatus(a.id, "resolvido")}>
                <CheckCircle2 className="size-3.5" />
                Resolver
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(a.id, "dispensado")}>
                <X className="size-3.5" />
                Dispensar
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setStatus(a.id, "aberto")}>
              <RotateCcw className="size-3.5" />
              Reabrir
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={pending}
            onClick={() => remove(a.id)}
            title="Excluir"
            className="text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Em aberto</h2>
          <span className="text-xs tabular-nums text-muted-foreground/70">{abertos.length}</span>
        </div>
        {abertos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <Eye className="mb-2 size-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhum acompanhamento em aberto.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Itens de &ldquo;ficar de olho&rdquo; sugeridos pela IA aparecem aqui quando você os confirma na fila de /tarefas.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40">{abertos.map((a) => <Row key={a.id} a={a} />)}</ul>
        )}
      </div>

      {fechados.length > 0 && (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Ocultar" : "Mostrar"} resolvidos/dispensados ({fechados.length})
          </Button>
          {showClosed && (
            <ul className="mt-2 flex flex-col divide-y divide-border/40">{fechados.map((a) => <Row key={a.id} a={a} />)}</ul>
          )}
        </div>
      )}
    </div>
  )
}
