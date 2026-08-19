"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Lock, Pin, PinOff, Pencil, Trash2, Users } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { canEditNote, type ClinicNote } from "@/lib/clinics/notes"
import {
  createClinicNote,
  deleteClinicNote,
  toggleClinicNotePin,
  updateClinicNote,
} from "@/lib/clinics/notes-actions"

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

/** Ordem canônica da lista — a mesma do índice do banco. Reaplicada no cliente
 *  porque as mutações otimistas mexem em `pinned_at` sem recarregar a página. */
function sortNotes(notes: ClinicNote[]): ClinicNote[] {
  return [...notes].sort((a, b) => {
    if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1
    if (a.pinned_at && b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at)
    return b.created_at.localeCompare(a.created_at)
  })
}

/**
 * Botão de alternar privacidade da anotação — dois estados explícitos em vez de
 * um switch, porque a consequência de cada um precisa estar escrita na tela: uma
 * anotação privada é invisível para o resto da equipe, gestor incluído, e isso é
 * fácil de marcar por acidente.
 */
function PrivacyToggle({
  isPrivate,
  onChange,
  disabled,
}: {
  isPrivate: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!isPrivate)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
        isPrivate
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
      title={
        isPrivate
          ? "Só você vê esta anotação — nem o gestor"
          : "Toda a equipe vê esta anotação"
      }
    >
      {isPrivate ? <Lock className="size-3" /> : <Users className="size-3" />}
      {isPrivate ? "Só eu" : "Equipe"}
    </button>
  )
}

/**
 * Anotações da clínica: o contexto que hoje se perde em conversa solta ("o dono
 * só responde depois das 18h", "a recepção nova ainda não sabe usar o funil").
 *
 * Cada anotação nasce compartilhada ou privada — decisão por anotação, não por
 * pessoa, porque a mesma pessoa escreve recado para o time e rascunho só dela.
 * As privadas de outras pessoas nem chegam aqui: o servidor as filtra em
 * `listClinicNotes`. Fixar (pin) é o mesmo eixo do pin de tarefa: "é NISSO que
 * estou olhando agora", independente da data.
 *
 * Mutações otimistas com rollback, como o resto do projeto.
 */
export function ClinicNotes({
  clinicId,
  notes: initial,
  viewerId,
}: {
  clinicId: string
  notes: ClinicNote[]
  viewerId: string | null
}) {
  const [notes, setNotes] = useState<ClinicNote[]>(() => sortNotes(initial))
  const [draft, setDraft] = useState("")
  const [draftPrivate, setDraftPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ id: string; body: string; isPrivate: boolean } | null>(
    null,
  )
  const confirm = useConfirm()

  async function create() {
    const body = draft.trim()
    if (!body) return
    setSaving(true)
    const res = await createClinicNote(clinicId, { body, is_private: draftPrivate })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    // Sem otimismo aqui: o id e o created_at vêm do banco, e a resposta é rápida
    // o bastante. Fingir a linha antes só criaria um id falso para reconciliar.
    setNotes((prev) => sortNotes([res.note, ...prev]))
    setDraft("")
    setDraftPrivate(false)
  }

  function saveEdit() {
    if (!editing) return
    const body = editing.body.trim()
    if (!body) return
    const { id, isPrivate } = editing
    const snapshot = notes
    setNotes((prev) =>
      sortNotes(
        prev.map((n) =>
          n.id === id ? { ...n, body, is_private: isPrivate, updated_at: new Date().toISOString() } : n,
        ),
      ),
    )
    setEditing(null)
    void (async () => {
      const res = await updateClinicNote(id, { body, is_private: isPrivate })
      if (!res.ok) {
        setNotes(snapshot)
        toast.error(res.error)
        return
      }
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === id ? res.note : n))))
    })()
  }

  function togglePin(note: ClinicNote) {
    const pinned = !note.pinned_at
    const snapshot = notes
    setNotes((prev) =>
      sortNotes(
        prev.map((n) =>
          n.id === note.id ? { ...n, pinned_at: pinned ? new Date().toISOString() : null } : n,
        ),
      ),
    )
    void (async () => {
      const res = await toggleClinicNotePin(note.id, pinned)
      if (!res.ok) {
        setNotes(snapshot)
        toast.error(res.error)
      }
    })()
  }

  async function remove(note: ClinicNote) {
    const ok = await confirm({
      title: "Excluir anotação?",
      description: "A anotação será removida em definitivo. Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    const snapshot = notes
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    const res = await deleteClinicNote(note.id)
    if (!res.ok) {
      setNotes(snapshot)
      toast.error(res.error)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Nova anotação ──────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter salva; Enter sozinho quebra linha (é texto corrido).
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void create()
            }
          }}
          rows={3}
          maxLength={5000}
          placeholder="O que vale registrar sobre esta clínica?"
          aria-label="Nova anotação"
          className="text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PrivacyToggle isPrivate={draftPrivate} onChange={setDraftPrivate} disabled={saving} />
          <div className="flex items-center gap-2">
            {draft.trim() && (
              <span className="text-[0.7rem] text-muted-foreground">
                {draft.trim().length}/5000 · Ctrl+Enter salva
              </span>
            )}
            <Button type="button" size="sm" onClick={create} disabled={saving || !draft.trim()}>
              {saving ? "Salvando…" : "Adicionar"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────────────── */}
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma anotação ainda. O que você contaria para quem vai pegar esta clínica amanhã?
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => {
            const editable = canEditNote(note, viewerId)
            const isEditing = editing?.id === note.id
            return (
              <li
                key={note.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  note.pinned_at ? "border-brand/40 bg-brand/5" : "border-border/60 bg-background/40",
                )}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      autoFocus
                      value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          saveEdit()
                        }
                        if (e.key === "Escape") setEditing(null)
                      }}
                      rows={4}
                      maxLength={5000}
                      className="text-sm"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <PrivacyToggle
                        isPrivate={editing.isPrivate}
                        onChange={(next) => setEditing({ ...editing, isPrivate: next })}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={saveEdit} disabled={!editing.body.trim()}>
                          Salvar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap break-words text-foreground">{note.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground">
                      {note.pinned_at && (
                        <span className="inline-flex items-center gap-1 text-brand">
                          <Pin className="size-3" /> em foco
                        </span>
                      )}
                      {note.is_private && (
                        <span
                          className="inline-flex items-center gap-1 text-amber-300"
                          title="Só você vê esta anotação"
                        >
                          <Lock className="size-3" /> só eu
                        </span>
                      )}
                      <span>{note.author_name ?? "autor removido"}</span>
                      <span aria-hidden>·</span>
                      <span title={`Criada em ${fmtDateTime(note.created_at)}`}>
                        {fmtDateTime(note.created_at)}
                      </span>
                      {note.updated_at !== note.created_at && (
                        <span title={`Editada em ${fmtDateTime(note.updated_at)}`}>(editada)</span>
                      )}

                      {editable && (
                        <span className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePin(note)}
                            aria-label={note.pinned_at ? "Desafixar anotação" : "Fixar anotação"}
                            className="transition-colors hover:text-foreground"
                          >
                            {note.pinned_at ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({ id: note.id, body: note.body, isPrivate: note.is_private })
                            }
                            aria-label="Editar anotação"
                            className="transition-colors hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(note)}
                            aria-label="Excluir anotação"
                            className="transition-colors hover:text-red-400"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
