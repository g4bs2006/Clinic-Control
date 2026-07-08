"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2, X, RotateCcw, Trash2, Eye, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  updateAcompanhamentoStatus,
  deleteAcompanhamento,
  acceptSuggestionAsAcompanhamento,
  type AcompanhamentoRow,
} from "@/lib/acompanhamentos/actions"
import { dismissTaskSuggestion, type TaskSuggestionRow } from "@/lib/tasks/actions"

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

function summaryDateLabel(d: string): string {
  if (!d) return ""
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
}

export function AcompanhamentosList({
  initialItems,
  initialSuggestions,
}: {
  initialItems: AcompanhamentoRow[]
  initialSuggestions: TaskSuggestionRow[]
}) {
  const [items, setItems] = useState(initialItems)
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [pending, startTransition] = useTransition()
  const [showClosed, setShowClosed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const abertos = items.filter((a) => a.status === "aberto")
  const fechados = items.filter((a) => a.status !== "aberto")

  function setStatus(id: string, status: AcompanhamentoRow["status"]) {
    const snapshot = items
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status, resolved_at: status === "aberto" ? null : new Date().toISOString() } : a)))
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

  // ── Sugestões (kind='acompanhamento') ──────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Cria a partir da sugestão e joga na lista na hora (sem recarregar). */
  function confirmOne(s: TaskSuggestionRow) {
    startTransition(async () => {
      const res = await acceptSuggestionAsAcompanhamento(s.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
      setItems((prev) => [
        {
          id: res.id,
          clinic_id: s.clinic_id,
          clinic_name: s.clinic_name,
          title: s.text,
          description: s.description,
          status: "aberto" as const,
          severity: s.severity,
          assigned_to: null,
          assigned_to_name: null,
          source: "ia" as const,
          created_at: new Date().toISOString(),
          resolved_at: null,
        },
        ...prev,
      ])
      toast.success("Acompanhamento criado.")
    })
  }

  function dismissOne(id: string) {
    startTransition(async () => {
      const res = await dismissTaskSuggestion(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSuggestions((prev) => prev.filter((x) => x.id !== id))
    })
  }

  function bulkConfirm() {
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (!chosen.length) return
    startTransition(async () => {
      const results = await Promise.all(chosen.map((s) => acceptSuggestionAsAcompanhamento(s.id)))
      const okIds = new Set<string>()
      const newRows: AcompanhamentoRow[] = []
      chosen.forEach((s, i) => {
        const r = results[i]
        if (r?.ok) {
          okIds.add(s.id)
          newRows.push({
            id: r.id,
            clinic_id: s.clinic_id,
            clinic_name: s.clinic_name,
            title: s.text,
            description: s.description,
            status: "aberto",
            severity: s.severity,
            assigned_to: null,
            assigned_to_name: null,
            source: "ia",
            created_at: new Date().toISOString(),
            resolved_at: null,
          })
        }
      })
      setSuggestions((prev) => prev.filter((x) => !okIds.has(x.id)))
      setItems((prev) => [...newRows, ...prev])
      setSelected(new Set())
      if (newRows.length) toast.success(`${newRows.length} acompanhamento(s) criado(s).`)
      if (newRows.length < chosen.length) toast.error("Algumas sugestões não puderam ser confirmadas.")
    })
  }

  function bulkDismiss() {
    const ids = [...selected]
    if (!ids.length) return
    startTransition(async () => {
      await Promise.all(ids.map((id) => dismissTaskSuggestion(id)))
      setSuggestions((prev) => prev.filter((x) => !selected.has(x.id)))
      setSelected(new Set())
      toast.success(`${ids.length} sugestão(ões) descartada(s).`)
    })
  }

  function Row({ a }: { a: AcompanhamentoRow }) {
    const closed = a.status !== "aberto"
    return (
      <li className={`flex flex-wrap items-start gap-3 py-3 ${closed ? "opacity-70" : ""}`}>
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
          {a.description && <p className="mt-0.5 text-xs italic text-muted-foreground/90">{a.description}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {a.clinic_id && a.clinic_name && (
              <Link href={`/clinicas/${a.clinic_id}`} className="hover:text-foreground transition-colors">
                {a.clinic_name}
              </Link>
            )}
            {a.assigned_to_name && <>· {a.assigned_to_name}</>}
            {closed && a.resolved_at ? <>· {a.status === "resolvido" ? "resolvido" : "dispensado"} {dateLabel(a.resolved_at)}</> : <>· aberto {dateLabel(a.created_at)}</>}
            {a.source === "ia" && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-400">IA</span>
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
    <div className="flex flex-col gap-6">
      {/* Em aberto */}
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
              Itens de &ldquo;ficar de olho&rdquo; confirmados abaixo aparecem aqui.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40">{abertos.map((a) => <Row key={a.id} a={a} />)}</ul>
        )}
      </div>

      {/* Histórico (resolvidos/dispensados) */}
      {fechados.length > 0 && (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Ocultar histórico" : `Histórico — resolvidos/dispensados (${fechados.length})`}
          </Button>
          {showClosed && (
            <ul className="mt-2 flex flex-col divide-y divide-border/40">{fechados.map((a) => <Row key={a.id} a={a} />)}</ul>
          )}
        </div>
      )}

      {/* Sugestões da IA (embaixo, como em /tarefas) */}
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-400">
              IA sugere
            </span>
            <p className="text-xs text-muted-foreground">
              Itens de acompanhamento identificados nos resumos — confirme para criar ou descarte.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/15 pb-2">
            <Checkbox
              checked={suggestions.length > 0 && suggestions.every((s) => selected.has(s.id))}
              onCheckedChange={(checked) => setSelected(checked ? new Set(suggestions.map((s) => s.id)) : new Set())}
              aria-label="Selecionar todas"
            />
            {selected.size > 0 ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">
                  {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
                </span>
                <div className="flex-1" />
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={bulkConfirm}>
                  <Check className="size-3.5" />
                  Confirmar ({selected.size})
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={bulkDismiss}>
                  <X className="size-3.5" />
                  Descartar ({selected.size})
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Selecione para confirmar ou descartar em lote</span>
            )}
          </div>

          <ul className="flex flex-col divide-y divide-amber-500/15">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-2 py-2">
                <Checkbox
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggleSelect(s.id)}
                  aria-label={`Selecionar ${s.text}`}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{s.text}</p>
                  {s.description && <p className="mt-0.5 text-xs italic text-muted-foreground/90">{s.description}</p>}
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/clinicas/${s.clinic_id}`} className="hover:text-foreground transition-colors">
                      {s.clinic_name}
                    </Link>
                    {s.summary_date && <> · {summaryDateLabel(s.summary_date)}</>}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => confirmOne(s)}>
                    <Check className="size-3.5" />
                    Confirmar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => dismissOne(s.id)}>
                    <X className="size-3.5" />
                    Descartar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
