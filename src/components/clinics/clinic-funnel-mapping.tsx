"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  getFunnelMappingSetup,
  saveFunnelMapping,
  type FunnelStepOption,
} from "@/lib/clinics/integration-actions";

interface ClinicFunnelMappingProps {
  clinicId: string;
}

type Bucket = "lead" | "scheduled" | "closing" | "noshow" | "notscheduled" | "attended";

// "Chegada" (lead) ficou FORA da matriz de propósito: não alimenta nenhuma
// métrica (leads = todos os cards do painel, sempre) e só gerava confusão —
// o valor salvo/pré-preenchido é preservado no save e usado no aviso abaixo.
const BUCKETS: { key: Exclude<Bucket, "lead">; label: string; hint: string }[] = [
  { key: "scheduled", label: "Agendado", hint: "colunas que contam como agendamento" },
  { key: "attended", label: "Compareceu", hint: "veio à consulta — conta também como agendado" },
  { key: "closing", label: "Fechamento", hint: "fechou tratamento — faturamento = valor dos cards; conta como compareceu/agendado" },
  { key: "noshow", label: "No-show", hint: "agendou e não compareceu — conta também como agendado" },
  { key: "notscheduled", label: "Não agendou", hint: "lead que não chegou a agendar — não conta como agendado" },
];

// Buckets em que marcar a coluna de CHEGADA infla as métricas (todos contam
// como "agendado" na hierarquia). "Não agendou" fica fora do aviso: a primeira
// coluna do painel pode legitimamente significar "chegou e não agendou".
const INFLATING_BUCKETS: Exclude<Bucket, "lead" | "notscheduled">[] = [
  "scheduled",
  "attended",
  "closing",
  "noshow",
];

const BUCKET_LABEL = Object.fromEntries(BUCKETS.map((b) => [b.key, b.label])) as Record<
  Exclude<Bucket, "lead">,
  string
>;

export function ClinicFunnelMapping({ clinicId }: ClinicFunnelMappingProps) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [steps, setSteps] = useState<FunnelStepOption[]>([]);
  const [sel, setSel] = useState<Record<Bucket, Set<string>>>({
    lead: new Set(),
    scheduled: new Set(),
    closing: new Set(),
    noshow: new Set(),
    notscheduled: new Set(),
    attended: new Set(),
  });
  const [isLoading, startLoad] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      startLoad(async () => {
        const res = await getFunnelMappingSetup(clinicId);
        if (!res.ok) {
          toast.error(res.error);
          setOpen(false);
          return;
        }
        setSteps([...res.setup.steps].sort((a, b) => a.position - b.position));
        setSel({
          lead: new Set(res.setup.leadStepIds),
          scheduled: new Set(res.setup.scheduledStepIds),
          closing: new Set(res.setup.closingStepIds),
          noshow: new Set(res.setup.noshowStepIds),
          notscheduled: new Set(res.setup.notScheduledStepIds),
          attended: new Set(res.setup.attendedStepIds),
        });
        setLoaded(true);
      });
    }
  }

  function toggleCell(bucket: Bucket, stepId: string, checked: boolean) {
    setSel((prev) => {
      const nextSet = new Set(prev[bucket]);
      if (checked) nextSet.add(stepId);
      else nextSet.delete(stepId);
      return { ...prev, [bucket]: nextSet };
    });
  }

  // Coluna de CHEGADA marcada como agendado/compareceu/fechamento/no-show
  // infla as métricas: cada card recém-chegado contaria como conversão (caso
  // real: Salutar, 2026-07 — 27 fechamentos falsos). Chegada presumida = o que
  // está salvo/pré-preenchido em leadStepIds + a PRIMEIRA coluna do painel.
  const firstStepId = steps[0]?.id;
  const arrivalIds = new Set([...sel.lead, ...(firstStepId ? [firstStepId] : [])]);
  const leadConflicts = steps
    .filter((s) => arrivalIds.has(s.id))
    .map((s) => ({
      title: s.title,
      buckets: INFLATING_BUCKETS.filter((k) => sel[k].has(s.id)).map((k) => BUCKET_LABEL[k]),
    }))
    .filter((c) => c.buckets.length > 0);

  function handleSave() {
    startSave(async () => {
      if (leadConflicts.length > 0) {
        const detail = leadConflicts
          .map((c) => `"${c.title}" em ${c.buckets.join(", ")}`)
          .join("; ");
        const ok = await confirm({
          title: "Coluna de chegada marcada como conversão",
          description:
            `${detail}. Cards recém-chegados contariam como agendado/comparecido/fechamento, inflando as métricas. ` +
            `Salvar mesmo assim?`,
          confirmLabel: "Salvar mesmo assim",
          destructive: true,
        });
        if (!ok) return;
      }
      const res = await saveFunnelMapping(clinicId, {
        leadStepIds: [...sel.lead],
        scheduledStepIds: [...sel.scheduled],
        closingStepIds: [...sel.closing],
        noshowStepIds: [...sel.noshow],
        notScheduledStepIds: [...sel.notscheduled],
        attendedStepIds: [...sel.attended],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Mapeamento de colunas salvo. Atualizando o funil…");
      setTimeout(() => window.location.reload(), 900);
    });
  }

  return (
    <div className="mt-4 border-t border-border/40 pt-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-3.5" />
          Configurar colunas do funil
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3">
          {isLoading && !loaded ? (
            <p className="text-sm text-muted-foreground py-2">Carregando colunas do painel…</p>
          ) : steps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhuma etapa encontrada no painel.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Marque, por coluna do painel Helena, o que corresponde a cada etapa. Leads = todos
                os cards do painel (nenhuma marcação necessária); colunas que não significam
                conversão (chegada, sem interesse etc.) ficam sem marcação. Fechamento também conta
                como comparecido/agendado. O número ao lado de cada etapa é o total de cards na
                coluna desde o início.
              </p>

              {/* Matriz: etapas × buckets */}
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Etapa</th>
                      {BUCKETS.map((b) => (
                        <th key={b.key} className="px-3 py-2 text-center font-medium" title={b.hint}>
                          {b.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s) => (
                      <tr key={s.id} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-medium text-foreground">{s.title}</span>
                          <span
                            className="ml-2 text-xs text-muted-foreground tabular-nums"
                            title="Total de cards na coluna desde o início"
                          >
                            {s.cardCount} no total
                          </span>
                        </td>
                        {BUCKETS.map((b) => {
                          const checked = sel[b.key].has(s.id);
                          return (
                            <td key={b.key} className="p-0 text-center">
                              {/* Célula inteira clicável — alvo grande e fácil de acertar */}
                              <button
                                type="button"
                                onClick={() => toggleCell(b.key, s.id, !checked)}
                                aria-pressed={checked}
                                aria-label={`${b.label}: ${s.title}`}
                                className="flex w-full items-center justify-center px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              >
                                <Checkbox
                                  checked={checked}
                                  tabIndex={-1}
                                  className="size-5 pointer-events-none"
                                />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {leadConflicts.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">
                      Coluna de chegada de leads marcada como conversão — isso infla as métricas.
                    </p>
                    <ul className="mt-1 list-disc pl-4">
                      {leadConflicts.map((c) => (
                        <li key={c.title}>
                          <span className="font-medium">{c.title}</span> parece ser a coluna onde os
                          leads chegam, mas está marcada em {c.buckets.join(", ")} — cada card
                          recém-chegado contaria como {c.buckets.join("/").toLowerCase()}.
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-amber-400/80">
                      Desmarque, a menos que essa coluna realmente signifique conversão nesta clínica.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button type="button" variant="secondary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Salvando…" : "Salvar mapeamento"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
