"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"
import { Pencil, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  saveAgentPersona,
  saveStageContent,
  type AgentRow,
} from "@/lib/agents/actions"

function Markdown({ children }: { children: string }) {
  return (
    <div className="md-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}

// Bloco de markdown com edição inline (view ↔ textarea).
function EditableMarkdown({
  value,
  emptyLabel,
  onSave,
}: {
  value: string | null
  emptyLabel: string
  onSave: (next: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await onSave(draft)
    setSaving(false)
    if (res.ok) {
      toast.success("Salvo")
      setEditing(false)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={16}
          className="w-full resize-y rounded-md border border-border bg-input px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(value ?? "")
              setEditing(false)
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="absolute right-0 top-0 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <Pencil className="size-3" /> Editar
      </button>
      {value ? (
        <Markdown>{value}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  )
}

export function ClinicAgents({ agents }: { agents: AgentRow[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <Bot className="size-6 opacity-40" />
        <span className="text-sm">Nenhum agente importado</span>
        <span className="text-xs opacity-70">
          Suba a pasta da clínica abaixo para importar persona e estágios.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {agents.map((agent) => (
        <div key={agent.id} className="flex flex-col gap-4">
          {/* Cabeçalho do agente */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Bot className="size-4" />
            </div>
            <span className="text-base font-semibold text-foreground">{agent.name}</span>
            {agent.unit && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {agent.unit}
              </span>
            )}
            {agent.source === "edited" && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
                editado
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {agent.stages.length} estágio{agent.stages.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Persona */}
          <div className="rounded-lg border border-border bg-[oklch(0.16_0_0)] p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Persona
            </h4>
            <EditableMarkdown
              value={agent.persona_md}
              emptyLabel="Sem persona definida."
              onSave={(next) => saveAgentPersona(agent.id, next)}
            />
          </div>

          {/* Estágios */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Estágios
            </h4>
            {agent.stages.map((stage) => (
              <details
                key={stage.id}
                className="group rounded-lg border border-border bg-[oklch(0.16_0_0)] open:bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex size-5 items-center justify-center rounded bg-muted text-[0.65rem] font-semibold tabular-nums text-muted-foreground">
                    {stage.position}
                  </span>
                  <span className="font-medium text-foreground">{stage.name}</span>
                  {stage.source === "edited" && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary">
                      editado
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="border-t border-border px-4 py-3">
                  <EditableMarkdown
                    value={stage.content_md}
                    emptyLabel="Sem conteúdo."
                    onSave={(next) => saveStageContent(stage.id, next)}
                  />
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
