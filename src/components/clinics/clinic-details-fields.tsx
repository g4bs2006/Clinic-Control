"use client"

import { useId, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import type { ClinicDetail } from "@/lib/clinics/notes"
import {
  deleteClinicDetail,
  reorderClinicDetails,
  setClinicDetail,
} from "@/lib/clinics/notes-actions"

/**
 * Campos livres da clínica — a extensão da "Ficha" para o que não merece coluna
 * própria no banco: "melhor horário para falar com o dono", "senha do wifi da
 * recepção", "nome da secretária que resolve".
 *
 * O `datalist` de rótulos existentes é o que impede o campo livre de virar lixo:
 * sem ele o mesmo dado nasce "Horário contato" numa clínica e "Horário de
 * contato" na outra, e comparar as duas depois é impossível. É sugestão, não
 * obrigação — rótulo novo continua livre.
 *
 * Ordem é manual (setas), não alfabética: o que importa nesta clínica sobe.
 */
export function ClinicDetailsFields({
  clinicId,
  details: initial,
  labelSuggestions,
}: {
  clinicId: string
  details: ClinicDetail[]
  labelSuggestions: string[]
}) {
  const [details, setDetails] = useState<ClinicDetail[]>(initial)
  const [editing, setEditing] = useState<{ id: string; label: string; value: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newValue, setNewValue] = useState("")
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const listId = useId()

  // Sugestões = rótulos usados em outras clínicas, menos os que esta já tem.
  const used = new Set(details.map((d) => d.label))
  const suggestions = labelSuggestions.filter((l) => !used.has(l))

  async function add() {
    const label = newLabel.trim()
    if (!label) return
    setSaving(true)
    const res = await setClinicDetail(clinicId, { label, value: newValue.trim() })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setDetails((prev) => {
      // Upsert também cobre "o rótulo já existia" — substitui em vez de duplicar.
      const rest = prev.filter((d) => d.id !== res.detail.id)
      return [...rest, res.detail].sort((a, b) => a.position - b.position)
    })
    setNewLabel("")
    setNewValue("")
    setAdding(false)
  }

  async function saveEdit() {
    if (!editing) return
    const label = editing.label.trim()
    if (!label) return
    const target = details.find((d) => d.id === editing.id)
    if (!target) return

    const snapshot = details
    const value = editing.value.trim()
    setDetails((prev) =>
      prev.map((d) => (d.id === editing.id ? { ...d, label, value: value || null } : d)),
    )
    setEditing(null)

    const res = await setClinicDetail(clinicId, { label, value }, target.label)
    if (!res.ok) {
      setDetails(snapshot)
      toast.error(res.error)
      return
    }
    setDetails((prev) => prev.map((d) => (d.id === res.detail.id ? res.detail : d)))
  }

  async function remove(detail: ClinicDetail) {
    const ok = await confirm({
      title: `Remover "${detail.label}"?`,
      description: "O campo e o valor dele serão apagados desta clínica.",
      confirmLabel: "Remover campo",
      destructive: true,
    })
    if (!ok) return
    const snapshot = details
    setDetails((prev) => prev.filter((d) => d.id !== detail.id))
    const res = await deleteClinicDetail(detail.id)
    if (!res.ok) {
      setDetails(snapshot)
      toast.error(res.error)
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= details.length) return
    const snapshot = details
    const next = [...details]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDetails(next.map((d, i) => ({ ...d, position: i })))
    void (async () => {
      const res = await reorderClinicDetails(
        clinicId,
        next.map((d) => d.id),
      )
      if (!res.ok) {
        setDetails(snapshot)
        toast.error(res.error)
      }
    })()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Uma única datalist para todos os inputs de rótulo da seção. */}
      <datalist id={listId}>
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {details.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">
          Nenhum campo por aqui. Use para o que a Ficha não cobre — horário do dono, contato da
          recepção, particularidades do atendimento.
        </p>
      )}

      {details.length > 0 && (
        <div className="flex flex-col divide-y divide-border/50">
          {details.map((detail, index) =>
            editing?.id === detail.id ? (
              <div key={detail.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row">
                <Input
                  autoFocus
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  list={listId}
                  maxLength={60}
                  placeholder="Nome do campo"
                  aria-label="Nome do campo"
                  className="h-8 text-sm sm:w-64"
                />
                <Input
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveEdit()
                    if (e.key === "Escape") setEditing(null)
                  }}
                  maxLength={2000}
                  placeholder="Valor"
                  aria-label="Valor do campo"
                  className="h-8 flex-1 text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={!editing.label.trim()}>
                    Salvar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={detail.id}
                className="group flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-sm text-muted-foreground">{detail.label}</span>
                <div className="flex items-center gap-2 sm:shrink-0">
                  {detail.value ? (
                    <span className="text-sm break-words text-foreground">{detail.value}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground/60 italic">sem valor</span>
                  )}
                  <span className="flex items-center gap-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Mover "${detail.label}" para cima`}
                      className="transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === details.length - 1}
                      aria-label={`Mover "${detail.label}" para baixo`}
                      className="transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ id: detail.id, label: detail.label, value: detail.value ?? "" })
                      }
                      aria-label={`Editar "${detail.label}"`}
                      className="transition-colors hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(detail)}
                      aria-label={`Remover "${detail.label}"`}
                      className="transition-colors hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            list={listId}
            maxLength={60}
            placeholder="Nome do campo"
            aria-label="Nome do novo campo"
            className="h-8 text-sm sm:w-64"
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add()
              if (e.key === "Escape") setAdding(false)
            }}
            maxLength={2000}
            placeholder="Valor"
            aria-label="Valor do novo campo"
            className="h-8 flex-1 text-sm"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void add()} disabled={saving || !newLabel.trim()}>
              {saving ? "Salvando…" : "Adicionar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false)
                setNewLabel("")
                setNewValue("")
              }}
              aria-label="Cancelar novo campo"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          <Plus className="size-3.5" /> adicionar campo
        </button>
      )}
    </div>
  )
}
