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
  updateClinicOpenAiProject,
  type OpenAiProjectOption,
} from "@/lib/openai-usage/actions"

const NONE = "__none__"

interface ClinicOpenAiProjectSelectProps {
  clinicId: string
  clinicName: string
  current: string | null
  projects: OpenAiProjectOption[]
}

export function ClinicOpenAiProjectSelect({
  clinicId,
  clinicName,
  current,
  projects,
}: ClinicOpenAiProjectSelectProps) {
  const [projectId, setProjectId] = useState<string>(current ?? "")
  const [pending, startTransition] = useTransition()

  // Sinaliza projeto já usado por OUTRA clínica (vínculo duplo quase sempre é engano).
  function label(p: OpenAiProjectOption): string {
    const taken = p.linkedToClinic && p.linkedToClinic !== clinicName
    return taken ? `${p.name} · já vinculado a ${p.linkedToClinic}` : p.name
  }

  function onChange(val: string | null) {
    if (!val) return
    const next = val === NONE ? "" : val
    const prev = projectId
    setProjectId(next) // optimistic

    startTransition(async () => {
      const res = await updateClinicOpenAiProject(clinicId, next)
      if (!res.ok) {
        setProjectId(prev) // revert
        toast.error(res.error)
      } else {
        toast.success(next ? "Projeto OpenAI vinculado" : "Vínculo removido")
      }
    })
  }

  if (projects.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum projeto sincronizado ainda — rode a Edge Function{" "}
        <code>collect-openai-usage</code> (ou aguarde o cron diário).
      </p>
    )
  }

  return (
    <Select
      value={projectId || NONE}
      items={{
        [NONE]: "— Sem vínculo —",
        ...Object.fromEntries(projects.map((p) => [p.projectId, label(p)])),
      }}
      onValueChange={onChange}
      disabled={pending}
    >
      <SelectTrigger id="clinic-openai-project" className="w-full sm:w-72">
        <SelectValue placeholder="Selecione o projeto OpenAI" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Sem vínculo —</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.projectId} value={p.projectId}>
            {label(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
