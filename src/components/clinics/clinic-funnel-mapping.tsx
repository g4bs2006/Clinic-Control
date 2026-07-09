"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  getFunnelMappingSetup,
  saveFunnelMapping,
  type FunnelStepOption,
} from "@/lib/clinics/integration-actions";

interface ClinicFunnelMappingProps {
  clinicId: string;
}

type Bucket = "lead" | "scheduled" | "closing";

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  { key: "lead", label: "Chegada", hint: "colunas de entrada de leads" },
  { key: "scheduled", label: "Agendado", hint: "colunas que contam como agendamento" },
  { key: "closing", label: "Fechamento", hint: "faturamento = valor dos cards nessas colunas" },
];

export function ClinicFunnelMapping({ clinicId }: ClinicFunnelMappingProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [steps, setSteps] = useState<FunnelStepOption[]>([]);
  const [sel, setSel] = useState<Record<Bucket, Set<string>>>({
    lead: new Set(),
    scheduled: new Set(),
    closing: new Set(),
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

  function handleSave() {
    startSave(async () => {
      const res = await saveFunnelMapping(clinicId, {
        leadStepIds: [...sel.lead],
        scheduledStepIds: [...sel.scheduled],
        closingStepIds: [...sel.closing],
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
                os cards do painel; agendados/faturamento seguem estas colunas. Fechamento também
                conta como agendado.
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
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                            {s.cardCount}
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
