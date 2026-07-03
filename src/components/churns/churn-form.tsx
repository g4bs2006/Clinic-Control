"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CHURN_REASONS } from "@/lib/churns/reasons"
import { registerChurn } from "@/lib/churns/actions"

interface ChurnFormProps {
  /** Clínicas elegíveis (não arquivadas) para registrar desligamento */
  clinics: { id: string; name: string }[]
  currentMonth: string // YYYY-MM
}

export function ChurnForm({ clinics, currentMonth }: ChurnFormProps) {
  const router = useRouter()
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [month, setMonth] = useState(currentMonth)
  const [reason, setReason] = useState<string>(CHURN_REASONS[0])
  const [notes, setNotes] = useState("")
  const [revenue, setRevenue] = useState("")
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!clinicId) {
      toast.error("Selecione a clínica.")
      return
    }
    startTransition(async () => {
      const res = await registerChurn({
        clinicId,
        churnMonth: month,
        reason,
        notes,
        lostRevenue: revenue ? Number(revenue.replace(",", ".")) : null,
      })
      if (res.ok) {
        toast.success("Churn registrado — clínica arquivada.")
        setClinicId(null)
        setNotes("")
        setRevenue("")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="churn-clinic">Clínica</Label>
          <Select
            value={clinicId ?? ""}
            items={Object.fromEntries(clinics.map((c) => [c.id, c.name]))}
            onValueChange={(v) => v && setClinicId(v)}
          >
            <SelectTrigger id="churn-clinic" className="h-9 w-full">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="churn-month">Mês do desligamento</Label>
          <Input
            id="churn-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="churn-reason">Motivo</Label>
          <Select value={reason} onValueChange={(v) => v && setReason(v)}>
            <SelectTrigger id="churn-reason" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHURN_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="churn-revenue">Mensalidade perdida (R$)</Label>
          <Input
            id="churn-revenue"
            inputMode="decimal"
            placeholder="Ex.: 1500"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            className="h-9 tabular-nums"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="churn-notes">Observações</Label>
        <Input
          id="churn-notes"
          placeholder="Contexto do desligamento, feedback do cliente…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-9"
        />
      </div>

      <div>
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={submit}>
          Registrar desligamento
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Ao registrar, a clínica é marcada como <strong>Arquivada</strong> e sai da carteira ativa.
        </p>
      </div>
    </div>
  )
}
