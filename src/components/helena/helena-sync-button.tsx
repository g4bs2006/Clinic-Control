"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { syncHelenaAccounts } from "@/lib/helena/accounts-actions"

export function HelenaSyncButton() {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSync() {
    startTransition(async () => {
      const res = await syncHelenaAccounts()
      if (!res.ok) {
        toast.error(res.error)
      } else {
        toast.success(
          `${res.total} contas sincronizadas · ${res.linked} vinculadas` +
            (res.webhookErrors > 0 ? ` · ${res.webhookErrors} sem leitura de webhooks` : ""),
        )
        router.refresh()
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onSync}
      disabled={pending}
      className="flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-xs font-semibold text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Sincronizando… (~1 min)" : "Sincronizar com a Helena"}
    </button>
  )
}
