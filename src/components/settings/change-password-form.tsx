"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changeOwnPassword } from "@/lib/users/actions"

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) {
      toast.error("A confirmação não confere com a nova senha")
      return
    }
    startTransition(async () => {
      const res = await changeOwnPassword(current, next)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Senha alterada")
      setCurrent("")
      setNext("")
      setConfirm("")
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="pw_current">Senha atual</Label>
        <Input
          id="pw_current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw_new">Nova senha</Label>
        <Input
          id="pw_new"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw_confirm">Confirmar nova senha</Label>
        <Input
          id="pw_confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Alterar senha"}
        </Button>
      </div>
    </form>
  )
}
