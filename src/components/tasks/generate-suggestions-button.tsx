"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  startSuggestionGeneration,
  listSuggestionJobs,
  type SuggestionJobRow,
} from "@/lib/tasks/generate-actions"

const ACTIVE = new Set(["queued", "syncing", "analyzing"])

function statusLabel(job: SuggestionJobRow): string {
  switch (job.status) {
    case "queued":
      return "Na fila…"
    case "syncing":
      return "Sincronizando grupos…"
    case "analyzing":
      return `Analisando ${job.progress_done}/${job.progress_total}`
    default:
      return ""
  }
}

/**
 * Botão "Gerar da IA" da página de tarefas — registra um job em background
 * (padrão do relatório de conversas) e mostra o andamento num chip inline,
 * sem travar a navegação. Ao concluir, toast com o resultado + refresh.
 */
export function GenerateSuggestionsButton({
  initialJobs,
  onGenerated,
}: {
  initialJobs: SuggestionJobRow[]
  onGenerated: () => void
}) {
  const [jobs, setJobs] = useState(initialJobs)
  const [pending, startTransition] = useTransition()
  // Job ativo que estamos acompanhando — para disparar o toast de conclusão
  // exatamente uma vez, na transição ativo → done/error.
  const watchingRef = useRef<string | null>(
    initialJobs.find((j) => ACTIVE.has(j.status))?.id ?? null,
  )

  const activeJob = jobs.find((j) => ACTIVE.has(j.status)) ?? null

  // Enquanto houver job ativo, atualiza a cada 5s (listSuggestionJobs também
  // re-dispara jobs travados no servidor).
  useEffect(() => {
    if (!activeJob) return
    const interval = setInterval(async () => {
      try {
        const next = await listSuggestionJobs()
        setJobs(next)
        const watched = watchingRef.current ? next.find((j) => j.id === watchingRef.current) : null
        if (watched && !ACTIVE.has(watched.status)) {
          watchingRef.current = null
          if (watched.status === "done") {
            const s = watched.stats
            const created = s?.created ?? 0
            toast.success(
              created > 0
                ? `${created} nova${created !== 1 ? "s" : ""} sugest${created !== 1 ? "ões" : "ão"} da IA — veja o bloco "IA sugere".`
                : "Análise concluída — nada novo nas conversas ou já existem tarefas parecidas.",
            )
            if (s?.sync_warning) {
              toast.warning(`Coleta ao vivo falhou (${s.sync_warning}) — usei as mensagens já coletadas.`)
            }
            if (s?.errors?.length) {
              toast.error(`${s.errors.length} clínica(s) com erro na análise.`)
            }
            onGenerated()
          } else {
            toast.error(watched.error ?? "A análise falhou.")
          }
        }
      } catch {
        /* transitório — próxima rodada tenta de novo */
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [activeJob, onGenerated])

  function generate() {
    startTransition(async () => {
      const res = await startSuggestionGeneration()
      if (res.ok) {
        toast.success(
          `Análise iniciada — ${res.clinicCount} clínica${res.clinicCount !== 1 ? "s" : ""} da carteira. Pode continuar navegando.`,
        )
        watchingRef.current = res.jobId
        setJobs(await listSuggestionJobs())
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {activeJob && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {statusLabel(activeJob)}
        </span>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || activeJob != null}
        onClick={generate}
        title="Ler os grupos de WhatsApp e gerar sugestões de tarefa (roda em segundo plano)"
      >
        <Sparkles className="size-3.5" />
        Gerar da IA
      </Button>
    </div>
  )
}
