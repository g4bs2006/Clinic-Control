"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addInvite, removeInvite, type UserInvite } from "@/lib/users/invites-actions"

const ROLE_ITEMS = { desenvolvedor: "Desenvolvedor", gestor: "Gestor" }

export function InvitesEditor({ initialInvites }: { initialInvites: UserInvite[] }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"gestor" | "desenvolvedor">("desenvolvedor")
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onAdd(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await addInvite(email, role)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${email.trim()} pré-aprovado — a pessoa já pode ativar a conta no login`)
      setEmail("")
      router.refresh()
    })
  }

  function onRemove(invite: UserInvite) {
    startTransition(async () => {
      const res = await removeInvite(invite.id)
      if (!res.ok) toast.error(res.error)
      else {
        toast.success("Convite removido")
        router.refresh()
      }
    })
  }

  const pendingInvites = initialInvites.filter((i) => !i.used_at)

  return (
    <div className="space-y-3 border-t border-border/40 pt-4">
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
        Convidar por e-mail
      </div>
      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@escalarodonto.com.br"
          required
          className="h-9 flex-1"
        />
        <Select
          value={role}
          items={ROLE_ITEMS}
          onValueChange={(v) => v && setRole(v as "gestor" | "desenvolvedor")}
        >
          <SelectTrigger className="h-9 w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desenvolvedor">Desenvolvedor</SelectItem>
            <SelectItem value="gestor">Gestor</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending} className="h-9 shrink-0">
          {pending ? "Salvando…" : "Convidar"}
        </Button>
      </form>

      {pendingInvites.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {pendingInvites.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-1.5 text-xs"
            >
              <span className="flex-1 truncate text-foreground">{i.email}</span>
              <span className="text-muted-foreground shrink-0">
                {i.role === "gestor" ? "Gestor" : "Desenvolvedor"} · aguardando ativação
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={pending}
                title="Remover convite"
                className="text-muted-foreground hover:text-red-400 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        A pessoa convidada acessa o login, clica em <strong>&ldquo;Novo por aqui? Ativar minha
        conta&rdquo;</strong>, informa este e-mail e cria a própria senha — sem depender de
        e-mail de convite.
      </p>
    </div>
  )
}
