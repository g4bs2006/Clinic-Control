"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Sparkles, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  updateAiSettings,
  previewSummary,
  type AiSettings,
  type SuggestionStats,
  type PreviewResult,
} from "@/lib/ai-settings/actions"

function pct(n: number | null): string {
  if (n == null) return "—"
  return (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%"
}

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

export function AiSettingsPanel({
  settings,
  stats,
  clinics,
}: {
  settings: AiSettings
  stats: SuggestionStats
  clinics: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()

  // Config
  const [instructions, setInstructions] = useState(settings.summary_instructions)
  const [model, setModel] = useState(settings.model ?? "deepseek-chat")
  const [temperature, setTemperature] = useState(String(settings.temperature ?? 0.3))
  const [maxTokens, setMaxTokens] = useState(String(settings.max_tokens ?? 1200))

  // Playground
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "")
  const [date, setDate] = useState(todayISO())
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, startPreview] = useTransition()

  function save() {
    startTransition(async () => {
      const res = await updateAiSettings({
        summary_instructions: instructions,
        model,
        temperature: Number(temperature),
        max_tokens: Number(maxTokens),
      })
      if (res.ok) toast.success("Configuração da IA salva.")
      else toast.error(res.error)
    })
  }

  function runPreview() {
    if (!clinicId) return
    setPreview(null)
    startPreview(async () => {
      const res = await previewSummary(clinicId, date)
      setPreview(res)
      if (!res.ok) toast.error(res.error)
    })
  }

  const clinicItems = Object.fromEntries(clinics.map((c) => [c.id, c.name]))

  return (
    <div className="flex flex-col gap-6">
      {/* ── Qualidade das sugestões ─────────────────────────────── */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Qualidade das sugestões
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Taxa de aceite</p>
            <p className="text-xl font-bold tabular-nums text-foreground">{pct(stats.acceptRate)}</p>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Aceitas</p>
            <p className="text-xl font-bold tabular-nums text-emerald-400">{stats.accepted}</p>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Descartadas</p>
            <p className="text-xl font-bold tabular-nums text-red-400">{stats.dismissed}</p>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Na fila</p>
            <p className="text-xl font-bold tabular-nums text-foreground">{stats.pending}</p>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Taxa de aceite = aceitas ÷ (aceitas + descartadas). Descartes altos podem indicar que o prompt
          precisa de ajuste.
        </p>
      </div>

      {/* ── Configuração ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Instruções do resumo diário
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={9}
          className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Persona + regras que a IA segue ao resumir e sugerir tarefas/acompanhamentos. O <strong>formato de
          saída (JSON)</strong> é fixo no sistema e não editável aqui — assim nada quebra o processamento.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Modelo
            <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-48" placeholder="deepseek-chat" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Temperatura
            <Input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="h-9 w-24" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            max_tokens
            <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="h-9 w-28" />
          </label>
          <Button type="button" disabled={pending} onClick={save} className="h-9">
            Salvar
          </Button>
        </div>
      </div>

      {/* ── Playground ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="size-3.5" /> Testar (sem gravar)
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Clínica
            <Select value={clinicId} items={clinicItems} onValueChange={(v) => v && setClinicId(v)}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Dia
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          </label>
          <Button type="button" variant="outline" disabled={previewing || !clinicId} onClick={runPreview} className="h-9">
            <Sparkles className="size-3.5" />
            {previewing ? "Gerando…" : "Testar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Roda o resumo do dia escolhido para essa clínica usando a configuração <strong>já salva</strong>
          {" "}(salve antes de testar). Não grava nada — é só pré-visualização.
        </p>

        {preview && preview.ok && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/10 p-3 text-sm">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Resultado · modelo {preview.model}
            </p>
            {preview.resumo_md && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Resumo</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{preview.resumo_md}</p>
              </div>
            )}
            {preview.highlights?.tarefas && preview.highlights.tarefas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Tarefas / acompanhamentos gerados
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {preview.highlights.tarefas.map((t, i) => (
                    <li key={i} className="text-sm">
                      <span
                        className={`mr-1.5 rounded px-1 py-0.5 text-[0.6rem] font-semibold uppercase ${
                          t.tipo === "acompanhamento" ? "bg-sky-500/15 text-sky-400" : "bg-brand/15 text-brand"
                        }`}
                      >
                        {t.tipo === "acompanhamento" ? "acomp." : "ação"}
                      </span>
                      {t.acao}
                      {t.motivo && <span className="text-xs italic text-muted-foreground"> — {t.motivo}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
