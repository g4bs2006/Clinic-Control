"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { KeyRound, Copy, UserPlus, Pencil, Trash2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
  setUserActive,
  resetUserPassword,
  type UserProfile,
} from "@/lib/users/actions"

const ROLE_LABEL: Record<UserProfile["role"], string> = {
  gestor: "Gestor",
  desenvolvedor: "Desenvolvedor",
}

export function UsersEditor({
  initialProfiles,
  clinicCountByDeveloper,
  currentUserId,
}: {
  initialProfiles: UserProfile[]
  clinicCountByDeveloper: Record<string, number>
  /** Id do usuário logado — a própria linha não mostra "Redefinir senha" (use Minha conta). */
  currentUserId?: string
}) {
  const confirm = useConfirm()
  const [profiles, setProfiles] = useState(initialProfiles)
  const [pending, startTransition] = useTransition()
  const [tempPassword, setTempPassword] = useState<{ userId: string; value: string } | null>(null)

  // Criação
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState<UserProfile["role"]>("desenvolvedor")
  const [createdTemp, setCreatedTemp] = useState<{ email: string; value: string } | null>(null)

  // Edição (nome + e-mail)
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")

  function onCreate(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createUser(newName, newEmail, newRole)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setProfiles((ps) => [...ps, res.user])
      setCreatedTemp({ email: res.user.email ?? newEmail.trim(), value: res.tempPassword })
      setNewName("")
      setNewEmail("")
      setNewRole("desenvolvedor")
      toast.success("Usuário criado")
    })
  }

  function onRoleChange(userId: string, role: UserProfile["role"]) {
    const prev = profiles
    setProfiles((ps) => ps.map((p) => (p.id === userId ? { ...p, role } : p))) // optimistic
    startTransition(async () => {
      const res = await updateUserRole(userId, role)
      if (!res.ok) {
        setProfiles(prev) // revert
        toast.error(res.error)
      } else {
        toast.success("Papel atualizado")
      }
    })
  }

  async function onActiveChange(userId: string, active: boolean) {
    // Desativar bloqueia o login da pessoa — confirma (reativar é inócuo, vai direto).
    if (!active) {
      const p = profiles.find((x) => x.id === userId)
      const ok = await confirm({
        title: "Desativar usuário?",
        description: `${p?.name || p?.email || "A pessoa"} deixa de conseguir entrar no sistema até ser reativada.`,
        confirmLabel: "Desativar",
        destructive: true,
      })
      if (!ok) return
    }
    const prev = profiles
    setProfiles((ps) => ps.map((p) => (p.id === userId ? { ...p, active } : p))) // optimistic
    startTransition(async () => {
      const res = await setUserActive(userId, active)
      if (!res.ok) {
        setProfiles(prev) // revert
        toast.error(res.error)
      } else {
        toast.success(active ? "Usuário reativado" : "Usuário desativado")
      }
    })
  }

  async function onResetPassword(p: UserProfile) {
    const ok = await confirm({
      title: "Redefinir senha?",
      description: `${p.name || p.email} receberá uma senha temporária e a senha atual deixa de funcionar.`,
      confirmLabel: "Redefinir",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await resetUserPassword(p.id)
      if (!res.ok) {
        toast.error(res.error)
      } else {
        setTempPassword({ userId: p.id, value: res.tempPassword })
      }
    })
  }

  function openEdit(p: UserProfile) {
    setEditing(p)
    setEditName(p.name ?? "")
    setEditEmail(p.email ?? "")
  }

  function onEditSave() {
    if (!editing) return
    const target = editing
    startTransition(async () => {
      const res = await updateUser(target.id, { name: editName, email: editEmail })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setProfiles((ps) =>
        ps.map((p) => (p.id === target.id ? { ...p, name: editName.trim(), email: editEmail.trim().toLowerCase() } : p)),
      )
      setEditing(null)
      toast.success("Usuário atualizado")
    })
  }

  async function onDelete(p: UserProfile) {
    const owned = clinicCountByDeveloper[p.id] ?? 0
    const extra = owned > 0 ? ` As ${owned} clínica(s) da carteira dele ficarão sem responsável.` : ""
    const ok = await confirm({
      title: `Excluir ${p.name || p.email}?`,
      description: `Remove o usuário em definitivo.${extra} Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteUser(p.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setProfiles((ps) => ps.filter((x) => x.id !== p.id))
      toast.success("Usuário excluído")
    })
  }

  async function copyTemp(value: string) {
    await navigator.clipboard.writeText(value)
    toast.success("Senha copiada")
  }

  return (
    <div className="space-y-3">
      {/* ── Criar usuário ─────────────────────────────────────── */}
      <form onSubmit={onCreate} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do usuário"
          required
          className="h-9 flex-1"
        />
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="email@escalarodonto.com.br"
          required
          className="h-9 flex-1"
        />
        <Select
          value={newRole}
          items={ROLE_LABEL}
          onValueChange={(v) => v && setNewRole(v as UserProfile["role"])}
        >
          <SelectTrigger className="h-9 w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABEL) as UserProfile["role"][]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending} className="h-9 shrink-0">
          <UserPlus className="size-3.5" />
          Criar
        </Button>
      </form>

      {createdTemp && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          <span>
            <strong>{createdTemp.email}</strong> criado — senha temporária:{" "}
            <code className="font-mono font-semibold">{createdTemp.value}</code>
          </span>
          <button type="button" onClick={() => copyTemp(createdTemp.value)} title="Copiar" className="hover:opacity-80">
            <Copy className="size-3" />
          </button>
          <span className="text-muted-foreground">— repasse agora, ela não aparece de novo</span>
          <button
            type="button"
            onClick={() => setCreatedTemp(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            dispensar
          </button>
        </div>
      )}

      {/* ── Lista ─────────────────────────────────────────────── */}
      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {profiles.map((p) => (
            <li
              key={p.id}
              className={`flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-accent/20 px-3 py-2 ${p.active === false ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">
                  {p.name || p.email || p.id.slice(0, 8)}
                  {p.active === false && (
                    <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-red-400">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                {tempPassword?.userId === p.id && (
                  <div className="mt-1 flex items-center gap-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-500">
                    <span>
                      Senha temporária: <code className="font-mono font-semibold">{tempPassword.value}</code>
                    </span>
                    <button type="button" onClick={() => copyTemp(tempPassword.value)} title="Copiar" className="hover:opacity-80">
                      <Copy className="size-3" />
                    </button>
                    <span className="text-muted-foreground">— repasse agora, ela não aparece de novo</span>
                  </div>
                )}
              </div>
              <span className="text-[0.68rem] text-muted-foreground tabular-nums shrink-0">
                {clinicCountByDeveloper[p.id] ?? 0} clínica
                {(clinicCountByDeveloper[p.id] ?? 0) !== 1 ? "s" : ""} na carteira
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => openEdit(p)}
                title="Editar nome e e-mail"
              >
                <Pencil className="size-3.5" />
                Editar
              </Button>
              {p.id !== currentUserId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onResetPassword(p)}
                  title="Gera uma senha temporária para repassar a este usuário"
                >
                  <KeyRound className="size-3.5" />
                  Redefinir senha
                </Button>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Switch
                  checked={p.active !== false}
                  onCheckedChange={(checked) => onActiveChange(p.id, checked)}
                  disabled={pending}
                />
                Ativo
              </label>
              <Select
                value={p.role}
                items={ROLE_LABEL}
                onValueChange={(v) => v && onRoleChange(p.id, v as UserProfile["role"])}
                disabled={pending}
              >
                <SelectTrigger className="w-44 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as UserProfile["role"][]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                onClick={() => onDelete(p)}
                title="Excluir usuário"
                className="shrink-0 text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Criar um usuário gera uma senha temporária para repassar — a pessoa troca depois em
        Configurações → Minha conta. O gestor vê toda a carteira; o desenvolvedor vê apenas as
        clínicas atribuídas a ele. Usuário inativo não consegue entrar. Excluir remove de vez:
        clínicas da carteira dele ficam sem responsável.
      </p>

      {/* ── Diálogo de edição ─────────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Nome
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              E-mail
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-9" />
            </label>
          </div>
          <DialogFooter>
            <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
            <Button type="button" disabled={pending} onClick={onEditSave}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
