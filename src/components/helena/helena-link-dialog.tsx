"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { HelenaAccountRow } from "@/lib/helena/accounts-actions"
import type { UserProfile } from "@/lib/users/actions"
import { createClinicFromHelenaAccount, linkHelenaAccountToClinic } from "@/lib/helena/link-actions"

const NONE = "__none__"

interface HelenaLinkDialogProps {
  account: HelenaAccountRow
  unintegratedClinics: { id: string; name: string }[]
  profile: UserProfile | null
  developerOptions: { id: string; name: string }[]
}

export function HelenaLinkDialog({
  account,
  unintegratedClinics,
  profile,
  developerOptions,
}: HelenaLinkDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"create" | "existing">(
    unintegratedClinics.length > 0 ? "existing" : "create",
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const [name, setName] = useState(account.name ?? "")
  const [legalName, setLegalName] = useState(account.legal_name ?? "")
  const [documentId, setDocumentId] = useState(account.document_id ?? "")
  const [ownerEmail, setOwnerEmail] = useState(account.email ?? "")
  const [ownerPhone, setOwnerPhone] = useState(account.phone ?? "")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [developerId, setDeveloperId] = useState(profile?.id ?? "")

  const [existingClinicId, setExistingClinicId] = useState<string>(
    unintegratedClinics[0]?.id ?? "",
  )

  const isGestor = profile?.role === "gestor"

  function handleCreate() {
    startTransition(async () => {
      const res = await createClinicFromHelenaAccount(
        account.company_id,
        {
          name,
          legal_name: legalName || undefined,
          document_id: documentId ? documentId.replace(/\D/g, "") : undefined,
          owner_email: ownerEmail || undefined,
          owner_phone: ownerPhone || undefined,
          city: city || undefined,
          state: state || undefined,
          mode: "auto",
          contract_status: "active",
        },
        developerId || null,
      )
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Clínica criada e vinculada")
      setOpen(false)
      router.refresh()
    })
  }

  function handleLinkExisting() {
    if (!existingClinicId) {
      toast.error("Selecione uma clínica")
      return
    }
    startTransition(async () => {
      const res = await linkHelenaAccountToClinic(account.company_id, existingClinicId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Conta vinculada à clínica")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-400 transition-colors hover:bg-amber-500/25">
        Vincular
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular conta Helena</DialogTitle>
          <DialogDescription>
            {account.name ?? "Conta sem nome"} · {account.legal_name ?? account.document_id ?? account.email ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
            disabled={unintegratedClinics.length === 0}
          >
            Vincular a clínica existente
          </Button>
          <Button
            type="button"
            variant={mode === "create" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("create")}
          >
            Criar clínica a partir desta conta
          </Button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-4">
            {unintegratedClinics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Não há clínicas sem integração — crie uma nova clínica a partir desta conta.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="existing_clinic">Clínica</Label>
                <Select
                  value={existingClinicId || NONE}
                  items={{
                    [NONE]: "Selecione uma clínica",
                    ...Object.fromEntries(unintegratedClinics.map((c) => [c.id, c.name])),
                  }}
                  onValueChange={(val) => {
                    if (val && val !== NONE) setExistingClinicId(val)
                  }}
                >
                  <SelectTrigger id="existing_clinic" className="w-full">
                    <SelectValue placeholder="Selecione uma clínica" />
                  </SelectTrigger>
                  <SelectContent>
                    {unintegratedClinics.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="link_name">Nome</Label>
                <Input id="link_name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_legal_name">Razão social</Label>
                <Input id="link_legal_name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_document_id">CNPJ / CPF</Label>
                <Input id="link_document_id" value={documentId} onChange={(e) => setDocumentId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_owner_email">E-mail do dono</Label>
                <Input
                  id="link_owner_email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_owner_phone">Telefone do dono</Label>
                <Input id="link_owner_phone" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_city">Cidade</Label>
                <Input id="link_city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_state">UF</Label>
                <Input
                  id="link_state"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="link_developer">Desenvolvedor responsável</Label>
              <Select
                value={developerId || (profile?.id ?? NONE)}
                items={
                  isGestor
                    ? Object.fromEntries(developerOptions.map((p) => [p.id, p.name]))
                    : profile
                      ? { [profile.id]: profile.name || profile.email || "Você" }
                      : {}
                }
                onValueChange={(val) => {
                  if (val) setDeveloperId(val)
                }}
                disabled={!isGestor}
              >
                <SelectTrigger id="link_developer" className="w-full">
                  <SelectValue placeholder="Você" />
                </SelectTrigger>
                <SelectContent>
                  {isGestor
                    ? developerOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    : profile && (
                        <SelectItem value={profile.id}>
                          {profile.name || profile.email || "Você"}
                        </SelectItem>
                      )}
                </SelectContent>
              </Select>
              {!isGestor && (
                <p className="text-xs text-muted-foreground">Fica na sua carteira.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose className="text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </DialogClose>
          <Button
            type="button"
            disabled={pending || (mode === "existing" && unintegratedClinics.length === 0)}
            onClick={mode === "existing" ? handleLinkExisting : handleCreate}
          >
            {pending ? "Salvando…" : mode === "existing" ? "Vincular" : "Criar e vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
