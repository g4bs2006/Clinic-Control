"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { KeyRound, Copy } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
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
}: {
  initialProfiles: UserProfile[]
  clinicCountByDeveloper: Record<string, number>
}) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [pending, startTransition] = useTransition()
  const [tempPassword, setTempPassword] = useState<{ userId: string; value: string } | null>(null)

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

  function onActiveChange(userId: string, active: boolean) {
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

  function onResetPassword(p: UserProfile) {
    if (!confirm(`Redefinir a senha de ${p.name || p.email}? A senha atual deixa de funcionar.`))
      return
    startTransition(async () => {
      const res = await resetUserPassword(p.id)
      if (!res.ok) {
        toast.error(res.error)
      } else {
        setTempPassword({ userId: p.id, value: res.tempPassword })
      }
    })
  }

  async function copyTemp() {
    if (!tempPassword) return
    await navigator.clipboard.writeText(tempPassword.value)
    toast.success("Senha copiada")
  }

  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
  }

  return (
    <div className="space-y-3">
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
                  <button type="button" onClick={copyTemp} title="Copiar" className="hover:opacity-80">
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
              onClick={() => onResetPassword(p)}
              title="Gera uma senha temporária para repassar ao usuário"
            >
              <KeyRound className="size-3.5" />
              Redefinir senha
            </Button>
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
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        O gestor vê toda a carteira; o desenvolvedor vê apenas as clínicas atribuídas a
        ele. &ldquo;Redefinir senha&rdquo; gera uma senha temporária para repassar — a
        pessoa troca depois em Configurações → Minha conta. Usuário inativo não
        consegue entrar.
      </p>
    </div>
  )
}
