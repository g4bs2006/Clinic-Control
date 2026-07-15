"use client"

import { useState, useTransition } from "react"
import { SearchCode, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  investigateTokenContacts,
  type InvestigateResult,
  type SuspectContact,
} from "@/lib/openai-usage/investigate"

const WINDOW_OPTIONS = { "2": "últimas 48h", "7": "últimos 7 dias" } as const

function fmtInt(v: number): string {
  return v.toLocaleString("pt-BR")
}

function fmtChars(v: number): string {
  return v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
}

function SuspectRow({ c, rank }: { c: SuspectContact; rank: number }) {
  const sinais: string[] = []
  if (c.dupRatio >= 0.4) sinais.push(`${Math.round(c.dupRatio * 100)}% msgs repetidas`)
  if (c.horasAtivas >= 16) sinais.push(`ativo em ${c.horasAtivas}h do dia`)

  return (
    <li
      className={`flex flex-col gap-1 rounded-md border p-2.5 ${
        c.suspeito ? "border-red-500/40 bg-red-500/5" : "border-border/50 bg-accent/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-foreground truncate">
          {rank}. {c.nome}
          {c.telefone && (
            <span className="ml-1.5 font-normal text-muted-foreground">{c.telefone}</span>
          )}
        </span>
        {c.suspeito && (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-red-400 shrink-0">
            <AlertTriangle className="size-3" /> possível loop
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem] text-muted-foreground tabular-nums">
        <span>
          <strong className="text-foreground">{fmtInt(c.msgsIa)}</strong> respostas da IA
        </span>
        <span>{fmtInt(c.msgsPaciente)} msgs do contato</span>
        <span>{fmtChars(c.chars)} caracteres</span>
        <span>
          {fmtInt(c.sessions)} {c.sessions === 1 ? "conversa" : "conversas"}
        </span>
        {sinais.map((s) => (
          <span key={s} className="text-red-400/90">
            {s}
          </span>
        ))}
      </div>
    </li>
  )
}

/** Ranqueia os contatos da Helena por sinais de consumo de tokens (outra IA,
 *  operadora, loop) — o passo seguinte ao alerta de "gasto OpenAI alto". */
export function InvestigateContacts({ clinicId }: { clinicId: string }) {
  const [windowDays, setWindowDays] = useState<string>("2")
  const [result, setResult] = useState<Extract<InvestigateResult, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    setError(null)
    startTransition(async () => {
      const res = await investigateTokenContacts(clinicId, Number(windowDays))
      if (res.ok) setResult(res)
      else {
        setResult(null)
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Investigar contatos
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={windowDays}
            items={WINDOW_OPTIONS}
            onValueChange={(v) => v && setWindowDays(v)}
            disabled={pending}
          >
            <SelectTrigger className="h-7 text-xs min-w-[8.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(WINDOW_OPTIONS).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={run} disabled={pending}>
            <SearchCode data-icon="inline-start" />
            {pending ? "Varrendo conversas…" : "Investigar"}
          </Button>
        </div>
      </div>
      <p className="text-[0.7rem] text-muted-foreground">
        Varre as conversas da Helena no período e ranqueia os contatos que mais consomem tokens —
        útil para achar outra IA, URA de operadora ou contato em loop quando o gasto dispara.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-[0.7rem] text-muted-foreground">
            {fmtInt(result.sessionsScanned)} conversas varridas ({WINDOW_OPTIONS[String(result.windowDays) as keyof typeof WINDOW_OPTIONS] ?? `${result.windowDays} dias`})
            {result.truncated && " · período com mais conversas que o teto — analisadas as mais recentes"}
          </p>
          {result.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conversa com IA no período.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {result.contacts.map((c, i) => (
                <SuspectRow key={c.contactId} c={c} rank={i + 1} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
