"use client"

import { useState } from "react"
import { Clock, CalendarClock, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

// Soma dias a uma data ISO (YYYY-MM-DD), ancorada ao meio-dia UTC pra não
// escorregar de dia. Comparação/geração de datas segue lexicográfica de string.
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Próxima segunda-feira (sempre no futuro; se hoje for segunda, a de daqui 7). */
function nextMondayISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const dow = d.getUTCDay() // 0 = domingo … 6 = sábado
  const add = ((8 - dow) % 7) || 7
  d.setUTCDate(d.getUTCDate() + add)
  return d.toISOString().slice(0, 10)
}

/** "qua, 23/07" a partir de YYYY-MM-DD. */
function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

/** Rótulo amigável pra feedback: "amanhã (qua, 23/07)" ou só "qua, 23/07". */
export function fmtSnoozeDate(iso: string, today?: string): string {
  const short = fmtShort(iso)
  if (today && iso === addDaysISO(today, 1)) return `amanhã (${short})`
  return short
}

interface SnoozeButtonProps {
  /** "Hoje" em America/Sao_Paulo (YYYY-MM-DD) — base dos presets e do "está adiada?". */
  today: string
  snoozedUntil: string | null
  onSnooze: (until: string | null) => void
  /** "icon" (linhas densas) ou "button" (rótulo, no rodapé do detalhe). */
  variant?: "icon" | "button"
  disabled?: boolean
  /** Classes extras aplicadas ao gatilho (ex.: `flex-1` no rodapé do rail). */
  className?: string
}

export function SnoozeButton({ today, snoozedUntil, onSnooze, variant = "icon", disabled, className }: SnoozeButtonProps) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState("")
  const isSnoozed = snoozedUntil != null && snoozedUntil > today

  const tomorrow = addDaysISO(today, 1)
  const nextWeek = nextMondayISO(today)

  function choose(until: string | null) {
    onSnooze(until)
    setOpen(false)
    setCustom("")
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={disabled}
          title={isSnoozed ? `Adiada até ${fmtShort(snoozedUntil!)}` : "Adiar tarefa"}
          aria-label="Adiar tarefa"
          className={`size-9 sm:size-8 ${isSnoozed ? "text-brand" : ""}`}
          onClick={() => setOpen(true)}
        >
          <Clock className="size-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className={className}
          onClick={() => setOpen(true)}
        >
          <Clock className="size-4" />
          {isSnoozed ? `Adiada até ${fmtShort(snoozedUntil!)}` : "Adiar"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" /> Adiar tarefa
            </DialogTitle>
            <DialogDescription>
              Some da lista até a data escolhida e reaparece sozinha. Não altera o prazo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" className="justify-between" onClick={() => choose(tomorrow)}>
              <span>Amanhã</span>
              <span className="text-xs capitalize text-muted-foreground">{fmtShort(tomorrow)}</span>
            </Button>
            <Button type="button" variant="outline" className="justify-between" onClick={() => choose(nextWeek)}>
              <span>Próxima semana</span>
              <span className="text-xs capitalize text-muted-foreground">{fmtShort(nextWeek)}</span>
            </Button>

            <div className="mt-1 flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                Escolher data
                <Input
                  type="date"
                  min={tomorrow}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="h-9"
                />
              </label>
              <Button
                type="button"
                disabled={!custom || custom <= today}
                onClick={() => custom && choose(custom)}
              >
                Adiar
              </Button>
            </div>

            {isSnoozed && (
              <Button
                type="button"
                variant="ghost"
                className="mt-1 text-muted-foreground"
                onClick={() => choose(null)}
              >
                <RotateCcw className="size-3.5" />
                Remover adiamento (mostrar agora)
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
