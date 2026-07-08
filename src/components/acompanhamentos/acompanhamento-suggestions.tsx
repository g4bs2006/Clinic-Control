"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { dismissTaskSuggestion, type TaskSuggestionRow } from "@/lib/tasks/actions"
import { acceptSuggestionAsAcompanhamento } from "@/lib/acompanhamentos/actions"

function dateLabel(d: string): string {
  if (!d) return ""
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

/** Fila de sugestões de acompanhamento (kind='acompanhamento') — vive em /acompanhamentos. */
export function AcompanhamentoSuggestions({ suggestions }: { suggestions: TaskSuggestionRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (suggestions.length === 0) return null

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirm(id: string) {
    startTransition(async () => {
      const res = await acceptSuggestionAsAcompanhamento(id)
      if (res.ok) {
        toast.success("Acompanhamento criado.")
        router.refresh()
      } else toast.error(res.error)
    })
  }

  function dismiss(id: string) {
    startTransition(async () => {
      const res = await dismissTaskSuggestion(id)
      if (res.ok) router.refresh()
      else toast.error(res.error)
    })
  }

  function bulkConfirm() {
    const ids = [...selected]
    if (!ids.length) return
    startTransition(async () => {
      const results = await Promise.all(ids.map((id) => acceptSuggestionAsAcompanhamento(id)))
      const ok = results.filter((r) => r.ok).length
      if (ok) toast.success(`${ok} acompanhamento(s) criado(s).`)
      setSelected(new Set())
      router.refresh()
    })
  }

  function bulkDismiss() {
    const ids = [...selected]
    if (!ids.length) return
    startTransition(async () => {
      await Promise.all(ids.map((id) => dismissTaskSuggestion(id)))
      toast.success(`${ids.length} sugestão(ões) descartada(s).`)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
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
          onCheckedChange={(checked) =>
            setSelected(checked ? new Set(suggestions.map((s) => s.id)) : new Set())
          }
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
              onCheckedChange={() => toggle(s.id)}
              aria-label={`Selecionar ${s.text}`}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{s.text}</p>
              {s.description && (
                <p className="mt-0.5 text-xs italic text-muted-foreground/90">{s.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                <Link href={`/clinicas/${s.clinic_id}`} className="hover:text-foreground transition-colors">
                  {s.clinic_name}
                </Link>
                {s.summary_date && <> · {dateLabel(s.summary_date)}</>}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => confirm(s.id)}>
                <Check className="size-3.5" />
                Confirmar
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => dismiss(s.id)}>
                <X className="size-3.5" />
                Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
