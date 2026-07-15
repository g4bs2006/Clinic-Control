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
import {
  updateClinicOpenAiKey,
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
  const [apiKeyId, setApiKeyId] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

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

  if (keys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma API key sincronizada ainda — rode a Edge Function{" "}
        <code>collect-openai-usage</code> (ou aguarde o cron diário).
      </p>
    )
  }

  return (
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
  )
}
