"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { createApiToken, revokeApiToken, type ApiTokenRow } from "@/lib/tokens/actions"

function formatDate(iso: string | null): string {
  if (!iso) return "nunca"
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export function ApiTokensEditor({ initialTokens }: { initialTokens: ApiTokenRow[] }) {
  const router = useRouter()
  const [tokens, setTokens] = useState(initialTokens)
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null)
  const confirm = useConfirm()

  function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const res = await createApiToken(trimmed)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setName("")
      setRevealed({ name: trimmed, token: res.token })
      router.refresh()
    })
  }

  async function revoke(row: ApiTokenRow) {
    const ok = await confirm({
      title: `Revogar "${row.name}"?`,
      description: "Qualquer ferramenta usando esse token perde acesso imediatamente. Não dá para desfazer.",
      confirmLabel: "Revogar",
      destructive: true,
    })
    if (!ok) return

    startTransition(async () => {
      const res = await revokeApiToken(row.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setTokens((rows) =>
        rows.map((r) => (r.id === row.id ? { ...r, revoked_at: new Date().toISOString() } : r)),
      )
      toast.success("Token revogado")
    })
  }

  async function copyRevealed() {
    if (!revealed) return
    await navigator.clipboard.writeText(revealed.token)
    toast.success("Copiado")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Nome do token</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Agents Planner — notebook"
            className="w-64"
          />
        </label>
        <Button onClick={create} disabled={pending || !name.trim()}>
          <Plus className="size-4" />
          Criar token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum token criado ainda.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {tokens.map((row) => {
            const revoked = row.revoked_at !== null
            return (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {row.name}
                    {revoked ? (
                      <span className="ml-2 text-xs font-normal text-destructive">revogado</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {row.token_prefix}… · criado {formatDate(row.created_at)} · último uso{" "}
                    {formatDate(row.last_used_at)}
                  </span>
                </div>
                {!revoked && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => void revoke(row)}
                  >
                    Revogar
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={revealed !== null} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent className="sm:max-w-lg">
          {revealed && (
            <>
              <DialogHeader>
                <DialogTitle>Token &ldquo;{revealed.name}&rdquo; criado</DialogTitle>
                <DialogDescription>
                  Copie agora — por segurança, esse valor não vai aparecer de novo em lugar
                  nenhum, nem para você.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs">
                  {revealed.token}
                </code>
                <Button variant="outline" size="icon" onClick={() => void copyRevealed()}>
                  <Copy className="size-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setRevealed(null)}>Já copiei</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
