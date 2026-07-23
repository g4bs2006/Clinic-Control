"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  updateClinicOpenAiKey,
  syncOpenAiKeys,
  type OpenAiKeyOption,
} from "@/lib/openai-usage/actions"

const NONE = "__none__"

interface ClinicOpenAiKeySelectProps {
  clinicId: string
  clinicName: string
  current: string | null
  keys: OpenAiKeyOption[]
}

export function ClinicOpenAiKeySelect({
  clinicId,
  clinicName,
  current,
  keys,
}: ClinicOpenAiKeySelectProps) {
  const router = useRouter()
  const [apiKeyId, setApiKeyId] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)

  // Sincroniza o cache de chaves da organização na hora (chave de clínica nova
  // aparece sem esperar o cron); o refresh recarrega a lista do servidor.
  function onSync() {
    setSyncing(true)
    startTransition(async () => {
      const res = await syncOpenAiKeys()
      setSyncing(false)
      if (res.ok) {
        toast.success(`${res.keys} chave(s) sincronizada(s) da organização`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  // Sinaliza key já usada por OUTRA clínica (vínculo duplo quase sempre é engano).
  function label(k: OpenAiKeyOption): string {
    const taken = k.linkedToClinic && k.linkedToClinic !== clinicName
    const suffix = k.redacted ? ` (…${k.redacted.slice(-4)})` : ""
    return taken ? `${k.name}${suffix} · já vinculada a ${k.linkedToClinic}` : `${k.name}${suffix}`
  }

  function onChange(val: string | null) {
    if (!val) return
    const next = val === NONE ? "" : val
    const prev = apiKeyId
    setApiKeyId(next) // optimistic

    startTransition(async () => {
      const res = await updateClinicOpenAiKey(clinicId, next)
      if (!res.ok) {
        setApiKeyId(prev) // revert
        toast.error(res.error)
      } else {
        toast.success(next ? "API key OpenAI vinculada" : "Vínculo removido")
      }
    })
  }

  const syncButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={syncing || pending}
      onClick={onSync}
      title="Busca na organização OpenAI as chaves novas (ex.: clínica que acabou de entrar)"
    >
      <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Sincronizando…" : "Sincronizar chaves"}
    </Button>
  )

  if (keys.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Nenhuma API key sincronizada ainda. Se a clínica acabou de entrar, sincronize as chaves
          da organização — ou aguarde o cron diário.
        </p>
        <div>{syncButton}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={apiKeyId || NONE}
        items={{
          [NONE]: "— Sem vínculo —",
          ...Object.fromEntries(keys.map((k) => [k.apiKeyId, label(k)])),
        }}
        onValueChange={onChange}
        disabled={pending}
      >
        <SelectTrigger id="clinic-openai-key" className="w-full sm:w-72">
          <SelectValue placeholder="Selecione a API key OpenAI" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Sem vínculo —</SelectItem>
          {keys.map((k) => (
            <SelectItem key={k.apiKeyId} value={k.apiKeyId}>
              {label(k)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {syncButton}
    </div>
  )
}
