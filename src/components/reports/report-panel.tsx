"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Download, FileSpreadsheet, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createReportJob,
  listReportJobs,
  getReportDownloadUrl,
  type ReportJobRow,
} from "@/lib/reports/actions"

const ACTIVE = new Set(["queued", "collecting", "analyzing"])

function fmtDate(d: string): string {
  return d.split("-").reverse().join("/")
}

function statusLabel(job: ReportJobRow): string {
  switch (job.status) {
    case "queued":
      return "Na fila"
    case "collecting":
      return job.progress_total
        ? `Coletando conversas ${job.progress_done}/${job.progress_total}`
        : "Coletando conversas"
    case "analyzing":
      return "Analisando e gerando planilha"
    case "done":
      return "Pronto"
    case "error":
      return "Erro"
  }
}

const STATUS_CLS: Record<ReportJobRow["status"], string> = {
  queued: "bg-zinc-500/15 text-zinc-400",
  collecting: "bg-blue-500/15 text-blue-400",
  analyzing: "bg-purple-500/15 text-purple-400",
  done: "bg-emerald-500/15 text-emerald-400",
  error: "bg-red-500/15 text-red-400",
}

// Mês anterior completo como período padrão
function defaultPeriod(): { start: string; end: string } {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: iso(first), end: iso(last) }
}

export function ReportPanel({
  clinicId,
  initialJobs,
}: {
  clinicId: string
  initialJobs: ReportJobRow[]
}) {
  const def = defaultPeriod()
  const [dateStart, setDateStart] = useState(def.start)
  const [dateEnd, setDateEnd] = useState(def.end)
  const [jobs, setJobs] = useState(initialJobs)
  const [pending, startTransition] = useTransition()
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasActive = jobs.some((j) => ACTIVE.has(j.status))

  // Enquanto houver job ativo, atualiza a lista a cada 5s (o listReportJobs
  // também re-dispara jobs travados no servidor).
  useEffect(() => {
    if (!hasActive) return
    pollingRef.current = setInterval(async () => {
      try {
        setJobs(await listReportJobs(clinicId))
      } catch {
        /* transitório — próxima rodada tenta de novo */
      }
    }, 5000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [hasActive, clinicId])

  function generate() {
    startTransition(async () => {
      const res = await createReportJob({ clinicId, dateStart, dateEnd })
      if (res.ok) {
        toast.success("Relatório na fila — a coleta começa em instantes.")
        setJobs(await listReportJobs(clinicId))
      } else {
        toast.error(res.error)
      }
    })
  }

  function download(jobId: string) {
    startTransition(async () => {
      const res = await getReportDownloadUrl(jobId)
      if (res.ok) window.open(res.url, "_blank")
      else toast.error(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Gerar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          De
          <Input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="h-8 w-[10rem]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <Input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="h-8 w-[10rem]"
          />
        </label>
        <Button
          type="button"
          size="sm"
          onClick={generate}
          disabled={pending || hasActive}
        >
          <FileSpreadsheet className="size-4" />
          Gerar relatório
        </Button>
        {hasActive && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            processando…
          </span>
        )}
      </div>

      {/* ── Histórico ─────────────────────────────────────────── */}
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum relatório gerado ainda. Escolha o período e clique em Gerar —
          a análise roda em segundo plano e a planilha fica disponível aqui.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {fmtDate(job.date_start)} – {fmtDate(job.date_end)}
                </p>
                <p className="text-xs text-muted-foreground">
                  solicitado em{" "}
                  {new Date(job.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Sao_Paulo",
                  })}
                  {job.status === "done" && job.stats && (
                    <>
                      {" "}· {job.stats.total} conversas · {job.stats.agendamentos}{" "}
                      agendamentos (
                      {(job.stats.taxaConversao * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %)
                    </>
                  )}
                  {job.status === "error" && job.error && (
                    <span className="text-red-400"> · {job.error}</span>
                  )}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${STATUS_CLS[job.status]}`}
              >
                {statusLabel(job)}
              </span>
              {job.status === "done" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => download(job.id)}
                >
                  <Download className="size-3.5" />
                  Baixar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
