"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { type PartnerContact, type PartnerRole } from "@/lib/clinics/partner-contacts"
import { WhatsAppButton } from "@/components/ui/whatsapp-button"
import {
  createPartnerContact,
  updatePartnerContact,
  deletePartnerContact,
} from "@/lib/clinics/partner-contacts-actions"

const ROLE_LABEL: Record<PartnerRole, string> = {
  strategist: "Estrategistas",
  traffic_manager: "Gestores de tráfego",
}
const ROLES: PartnerRole[] = ["strategist", "traffic_manager"]

type Draft = { name: string; email: string; phone: string }
const EMPTY: Draft = { name: "", email: "", phone: "" }

export function PartnerContactsEditor({
  initialContacts,
  readOnly = false,
}: {
  initialContacts: PartnerContact[]
  readOnly?: boolean
}) {
  const confirm = useConfirm()
  const [contacts, setContacts] = useState(initialContacts)
  const [drafts, setDrafts] = useState<Record<PartnerRole, Draft>>({
    strategist: { ...EMPTY },
    traffic_manager: { ...EMPTY },
  })
  const [pending, startTransition] = useTransition()

  function patchLocal(id: string, patch: Partial<PartnerContact>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function save(c: PartnerContact) {
    startTransition(async () => {
      const res = await updatePartnerContact(c.id, { name: c.name, email: c.email, phone: c.phone })
      if (res.ok) toast.success("Contato salvo.")
      else toast.error(res.error)
    })
  }

  async function remove(c: PartnerContact) {
    const ok = await confirm({
      title: "Remover contato?",
      description: `${c.name || "Este contato"} sai da lista. Clínicas que já usam o nome mantêm o texto, mas sem e-mail/telefone.`,
      confirmLabel: "Remover",
      destructive: true,
    })
    if (!ok) return
    const snapshot = contacts
    setContacts((prev) => prev.filter((x) => x.id !== c.id))
    startTransition(async () => {
      const res = await deletePartnerContact(c.id)
      if (res.ok) toast.success("Contato removido.")
      else {
        setContacts(snapshot)
        toast.error(res.error)
      }
    })
  }

  function add(role: PartnerRole) {
    const d = drafts[role]
    if (d.name.trim().length < 2) {
      toast.error("Nome muito curto.")
      return
    }
    startTransition(async () => {
      const res = await createPartnerContact({ role, name: d.name, email: d.email, phone: d.phone })
      if (res.ok) {
        setContacts((prev) => [...prev, res.contact])
        setDrafts((prev) => ({ ...prev, [role]: { ...EMPTY } }))
        toast.success("Contato adicionado.")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {ROLES.map((role) => {
        const rows = contacts.filter((c) => c.role === role)
        return (
          <div key={role} className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {ROLE_LABEL[role]}
            </p>

            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">Ninguém cadastrado ainda.</p>
            )}

            <ul className="flex flex-col gap-1.5">
              {rows.map((c) => {
                return (
                  <li
                    key={c.id}
                    className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-accent/20 p-2 sm:grid-cols-[1fr_1.4fr_1fr_auto] sm:items-center"
                  >
                    {readOnly ? (
                      <>
                        <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{c.email || "—"}</span>
                        <span className="truncate text-xs text-muted-foreground">{c.phone || "—"}</span>
                        <span className="flex justify-end">
                          <WhatsAppButton phone={c.phone} className="text-xs" />
                        </span>
                      </>
                    ) : (
                      <>
                        <Input
                          value={c.name}
                          onChange={(e) => patchLocal(c.id, { name: e.target.value })}
                          className="h-8"
                          placeholder="Nome"
                        />
                        <Input
                          type="email"
                          value={c.email ?? ""}
                          onChange={(e) => patchLocal(c.id, { email: e.target.value })}
                          className="h-8"
                          placeholder="email@exemplo.com"
                        />
                        <Input
                          value={c.phone ?? ""}
                          onChange={(e) => patchLocal(c.id, { phone: e.target.value })}
                          className="h-8 tabular-nums"
                          placeholder="(00) 00000-0000"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Só o ícone: a linha em edição já tem três inputs. */}
                          <WhatsAppButton phone={c.phone} label="" className="text-xs" />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => save(c)}
                          >
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => remove(c)}
                            title="Remover contato"
                            className="text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>

            {!readOnly && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto] sm:items-center">
                <Input
                  value={drafts[role].name}
                  onChange={(e) => setDrafts((p) => ({ ...p, [role]: { ...p[role], name: e.target.value } }))}
                  className="h-8"
                  placeholder="Nome"
                />
                <Input
                  type="email"
                  value={drafts[role].email}
                  onChange={(e) => setDrafts((p) => ({ ...p, [role]: { ...p[role], email: e.target.value } }))}
                  className="h-8"
                  placeholder="email@exemplo.com (opcional)"
                />
                <Input
                  value={drafts[role].phone}
                  onChange={(e) => setDrafts((p) => ({ ...p, [role]: { ...p[role], phone: e.target.value } }))}
                  className="h-8 tabular-nums"
                  placeholder="Telefone (opcional)"
                />
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => add(role)}>
                  <Plus className="size-3.5" />
                  Adicionar
                </Button>
              </div>
            )}
          </div>
        )
      })}

      <p className="text-xs leading-relaxed text-muted-foreground">
        O telefone com DDD gera o botão de WhatsApp no cadastro da clínica (assume Brasil +55 se
        não houver DDI). O nome é o que aparece na seleção da clínica; renomear aqui atualiza as
        clínicas que já usam o nome.
      </p>
    </div>
  )
}
