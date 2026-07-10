"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Stethoscope } from "lucide-react"
import { Button } from "@/components/ui/button"
import { postOnboardingDiagnostic, type OnboardingThemeRow } from "@/lib/tasks/insights-actions"

/**
 * Diagnóstico pós-onboarding: temas de tarefa que se repetem em ≥2 clínicas nos
 * primeiros 30 dias de vida — candidatos a defeito do processo de implantação.
 * A correção natural vira item do checklist fixo (editores nesta mesma página).
 */
export function OnboardingDiagnostic() {
  const [themes, setThemes] = useState<OnboardingThemeRow[] | null>(null)
  const [clinicsAnalyzed, setClinicsAnalyzed] = useState(0)
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      const res = await postOnboardingDiagnostic()
      if (res.ok) {
        setThemes(res.themes)
        setClinicsAnalyzed(res.clinicsAnalyzed)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground max-w-[52ch]">
          Tarefas que se repetem entre clínicas nos <strong>primeiros 30 dias</strong> apontam o que o
          onboarding deixou passar. Âncora: data de conclusão do onboarding (fallback: criação da clínica).
        </p>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={run}>
          <Stethoscope className="size-3.5" />
          {pending ? "Analisando…" : "Gerar diagnóstico"}
        </Button>
      </div>

      {themes !== null && (
        themes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum tema recorrente entre clínicas na janela de 30 dias
            {clinicsAnalyzed > 0 ? ` (${clinicsAnalyzed} clínica${clinicsAnalyzed !== 1 ? "s" : ""} com tarefas na janela)` : ""}.
            Ou o processo está redondo, ou ainda falta histórico de tarefas.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {clinicsAnalyzed} clínica{clinicsAnalyzed !== 1 ? "s" : ""} com tarefas na janela · temas em ≥2 clínicas:
            </p>
            <ul className="flex flex-col gap-2">
              {themes.map((t) => (
                <li key={t.title} className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium">{t.title}</p>
                    <span
                      className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[0.68rem] font-bold text-rose-400 tabular-nums"
                      title={t.clinicNames.join(", ")}
                    >
                      {t.clinicsCount} clínicas
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aparece entre os dias {t.dayRange[0]} e {t.dayRange[1]} de vida ·{" "}
                    <span title={t.clinicNames.join(", ")}>{t.clinicNames.slice(0, 3).join(", ")}{t.clinicNames.length > 3 ? "…" : ""}</span>
                  </p>
                  {t.examples.length > 1 && (
                    <p className="mt-1 text-[0.7rem] italic text-muted-foreground/80">
                      variações: {t.examples.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[0.7rem] text-muted-foreground">
              Correção sugerida: transformar cada tema em item do checklist fixo da etapa correspondente
              (Painéis, n8n, Agente de IA, Chatbot) — editores logo acima nesta página.
            </p>
          </div>
        )
      )}
    </div>
  )
}
