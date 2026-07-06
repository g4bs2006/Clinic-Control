"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  updateReportKeywords,
  type ReportKeywordRow,
} from "@/lib/reports/actions"

const STAGE_LABEL: Record<string, string> = {
  E1: "E1 · Acolhimento",
  E2: "E2 · Investigação (SPIN)",
  E3: "E3 · Problema/Implicação",
  E4: "E4 · Necessidade/Desejo",
  E5_TENTOU: "E5 · Tentou agendar (mostrou vagas)",
  E5_AGENDOU: "E5 · Sinais de agendamento no texto",
  E5_PEDIU_DADOS: "E5.2 · Pediu dados do paciente",
  E5_VALIDANDO: "E5.3 · Validando dados",
  E6: "E6 · Finalização",
  E7: "E7 · Transbordo para humano",
  E8: "E8 · Melhoria de base",
}

export function ReportKeywordsEditor({
  initialRows,
  readOnly,
}: {
  initialRows: ReportKeywordRow[]
  readOnly: boolean
}) {
  const [drafts, setDrafts] = useState(() =>
    initialRows.map((r) => ({ stage: r.stage, text: r.terms.join(", ") })),
  )
  const [pending, startTransition] = useTransition()

  function save(index: number) {
    const d = drafts[index]
    startTransition(async () => {
      const terms = d.text.split(",").map((t) => t.trim()).filter(Boolean)
      const res = await updateReportKeywords(d.stage, terms)
      if (res.ok) toast.success(`Keywords de ${STAGE_LABEL[d.stage] ?? d.stage} salvas.`)
      else toast.error(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((d, i) => (
        <div key={d.stage} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">
              {STAGE_LABEL[d.stage] ?? d.stage}
            </span>
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => save(i)}
              >
                Salvar
              </Button>
            )}
          </div>
          <textarea
            value={d.text}
            readOnly={readOnly}
            onChange={(e) =>
              setDrafts((prev) =>
                prev.map((item, idx) => (idx === i ? { ...item, text: e.target.value } : item)),
              )
            }
            rows={2}
            className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Termos separados por vírgula, comparados em minúsculas contra o texto das
        conversas. O conjunto atual foi calibrado para o roteiro SPIN da COLT —
        ajuste para o roteiro da IA das suas clínicas. A detecção de agendamento
        real NÃO usa keywords: vem dos cards do painel CRM.
      </p>
    </div>
  )
}
