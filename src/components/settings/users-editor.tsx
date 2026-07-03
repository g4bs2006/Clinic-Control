"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateUserRole, type UserProfile } from "@/lib/users/actions"

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

  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
  }

  return (
    <div className="space-y-3">
      <ul className="flex flex-col gap-1.5">
        {profiles.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-accent/20 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground truncate">
                {p.name || p.email || p.id.slice(0, 8)}
              </div>
              <div className="text-xs text-muted-foreground truncate">{p.email}</div>
            </div>
            {p.role === "desenvolvedor" && (
              <span className="text-[0.68rem] text-muted-foreground tabular-nums shrink-0">
                {clinicCountByDeveloper[p.id] ?? 0} clínica
                {(clinicCountByDeveloper[p.id] ?? 0) !== 1 ? "s" : ""} na carteira
              </span>
            )}
            <Select
              value={p.role}
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
        Novos usuários criados no Supabase Auth entram automaticamente como
        desenvolvedores. O gestor vê toda a carteira; o desenvolvedor verá apenas as
        clínicas atribuídas a ele (o bloqueio por carteira será ativado quando os
        desenvolvedores ganharem acesso).
      </p>
    </div>
  )
}
