"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { activateAccount } from "@/lib/users/invites-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ActivateAccountForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error("As senhas não conferem.")
      return
    }
    startTransition(async () => {
      const res = await activateAccount(email, password)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Conta ativada — bem-vindo!")
      router.push("/")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mínimo 8 caracteres"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar senha</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Ativando…" : "Criar senha e entrar"}
      </Button>
    </form>
  )
}
