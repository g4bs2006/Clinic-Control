"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  getSuggestionGenerationScope,
  generateSuggestionsForClinics,
  countPendingSuggestions,
  type GenerationScope,
} from "@/lib/tasks/generate-actions"
import { syncWhatsappGroups } from "@/lib/whatsapp/actions"

// Lotes de 3 = concorrência da Edge Function: cada chamada resolve em ~1 rodada
// de LLM e a server action fica folgada dentro do timeout.
const BATCH_SIZE = 3

type Phase = "idle" | "sync" | "analyze" | "done"

type RunResult = {
  created: number
  summarized: number
  skipped: number
  errors: string[]
  syncWarning: string | null
}

export function GenerateSuggestionsDialog({ onGenerated }: { onGenerated: () => void }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<GenerationScope | null>(null)
  const [scopeError, setScopeError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<RunResult | null>(null)

  const running = phase === "sync" || phase === "analyze"

  function handleOpenChange(v: boolean) {
    if (!v && running) return // não fecha no meio da análise
    setOpen(v)
    if (v) {
      setPhase("idle")
      setResult(null)
      setScope(null)
      setScopeError(null)
      getSuggestionGenerationScope().then((res) => {
        if (res.ok) setScope({ clinics: res.clinics, unmappedCount: res.unmappedCount })
        else setScopeError(res.error)
      })
    }
  }

  async function run() {
    if (!scope || !scope.clinics.length) return
    setProgress(0)
    setResult(null)

    // 1) Coleta as mensagens mais recentes dos grupos (se falhar, analisa o que
    // já está no banco e avisa que o dado pode estar defasado).
    setPhase("sync")
    const before = await countPendingSuggestions()
    let syncWarning: string | null = null
    const sync = await syncWhatsappGroups()
    if (!sync.ok) syncWarning = sync.error

    // 2) Analisa em lotes: cada lote re-gera o resumo de hoje dessas clínicas e
    // o trigger converte as tarefas encontradas em sugestões (com dedup).
    setPhase("analyze")
    let summarized = 0
    let skipped = 0
    const errors: string[] = []
    for (let i = 0; i < scope.clinics.length; i += BATCH_SIZE) {
      const batch = scope.clinics.slice(i, i + BATCH_SIZE)
      const res = await generateSuggestionsForClinics(batch.map((c) => c.id))
      if (res.ok) {
        summarized += res.summarized
        skipped += res.skipped
        errors.push(...res.errors)
      } else {
        errors.push(...batch.map((c) => `${c.name}: ${res.error}`))
      }
      setProgress(Math.min(i + BATCH_SIZE, scope.clinics.length))
    }

    const after = await countPendingSuggestions()
    setResult({ created: Math.max(0, after - before), summarized, skipped, errors, syncWarning })
    setPhase("done")
    onGenerated()
    if (errors.length === 0) toast.success("Análise dos grupos concluída.")
  }

  const total = scope?.clinics.length ?? 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={buttonVariants({ variant: "outline", size: "sm" })}
        title="Ler os grupos de WhatsApp e gerar sugestões de tarefa"
      >
        <Sparkles className="size-3.5" />
        Gerar da IA
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar tarefas dos grupos</DialogTitle>
          <DialogDescription>
            Lê as conversas de hoje nos grupos de WhatsApp das clínicas da carteira ativa e
            transforma pendências em sugestões de tarefa — elas aparecem no bloco &ldquo;IA
            sugere&rdquo; para você confirmar ou descartar.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="text-sm">
            {scopeError ? (
              <p className="text-destructive">{scopeError}</p>
            ) : !scope ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Carregando escopo…
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p>
                  <span className="font-medium">{total}</span> clínica{total !== 1 ? "s" : ""} com
                  grupo mapeado {total !== 1 ? "serão analisadas" : "será analisada"}.
                </p>
                {scope.unmappedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {scope.unmappedCount} clínica{scope.unmappedCount !== 1 ? "s" : ""} da carteira
                    sem grupo mapeado fica{scope.unmappedCount !== 1 ? "m" : ""} de fora — mapeie em
                    Configurações.
                  </p>
                )}
                {total > 12 && (
                  <p className="text-xs text-muted-foreground">
                    Volume grande — a análise pode levar alguns minutos.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {running && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {phase === "sync"
                ? "Sincronizando mensagens dos grupos…"
                : `Analisando conversas… ${progress}/${total} clínicas`}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${total ? Math.round((progress / total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              {result.created > 0 ? (
                <>
                  <span className="font-medium">{result.created}</span>&nbsp;nova
                  {result.created !== 1 ? "s" : ""} sugest{result.created !== 1 ? "ões" : "ão"} para
                  revisar.
                </>
              ) : (
                "Nenhuma sugestão nova — nada de novo nas conversas ou já existem tarefas parecidas."
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.summarized} clínica{result.summarized !== 1 ? "s" : ""} analisada
              {result.summarized !== 1 ? "s" : ""}
              {result.skipped > 0 && <> · {result.skipped} sem mensagens suficientes hoje</>}
            </p>
            {result.syncWarning && (
              <p className="flex items-start gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Coleta ao vivo falhou ({result.syncWarning}) — usei as mensagens já coletadas, que
                podem estar defasadas.
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {result.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "done" ? (
            <DialogClose className={buttonVariants({})}>Fechar</DialogClose>
          ) : (
            <>
              <DialogClose className={buttonVariants({ variant: "outline" })} disabled={running}>
                Cancelar
              </DialogClose>
              <Button type="button" disabled={running || !scope || !total} onClick={run}>
                {running && <Loader2 className="size-3.5 animate-spin" />}
                Analisar grupos
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
