"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Workflow, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getAutomationSetup,
  saveAutomationConfig,
  detectAutomationForClinic,
  type AutomationSetup,
} from "@/lib/clinics/automation-actions";
import {
  AUTOMATION_FIELD_LABEL,
  AUTOMATION_FIELD_SOURCE,
  type AutomationCatalog,
  type AutomationConfig,
  type AutomationFieldName,
} from "@/lib/clinics/automation";

// Sentinela do "não definido": o Select do Base UI não aceita null como valor de
// item, então o vazio precisa de um valor próprio (ver clinic-control-base-ui-select).
const NONE = "__none__";

/** Grupos só para organizar a tela — a ordem espelha o fluxo do card na Helena. */
const GROUPS: { title: string; hint: string; fields: AutomationFieldName[] }[] = [
  {
    title: "Etapas do painel",
    hint: "para onde a automação MOVE o card",
    fields: ["leadStepId", "scheduledStepId", "cancelledStepId"],
  },
  {
    title: "Campos de data",
    hint: "onde a automação grava quando agendou e para quando",
    fields: ["scheduledAtFieldKey", "scheduledForFieldKey"],
  },
  {
    title: "Etiquetas de agendamento",
    hint: "marcam que foi a IA que agendou",
    fields: ["iaCardTagId", "scheduledContactTagId"],
  },
  {
    title: "Origem do lead",
    hint: "uma etiqueta de card e uma de contato por origem",
    fields: [
      "fbPanelTagId",
      "fbContactTagId",
      "igPanelTagId",
      "igContactTagId",
      "orgPanelTagId",
      "orgContactTagId",
    ],
  },
];

/** Opções do catálogo certo para cada campo, já como mapa valor→rótulo. */
function optionsFor(
  field: AutomationFieldName,
  catalog: AutomationCatalog,
): Record<string, string> {
  const source = AUTOMATION_FIELD_SOURCE[field];
  const entries: [string, string][] =
    source === "step"
      ? [...catalog.steps].sort((a, b) => a.position - b.position).map((s) => [s.id, s.title])
      : source === "customField"
        ? catalog.customFields.map((f) => [f.key, f.name])
        : source === "panelTag"
          ? catalog.panelTags.map((t) => [t.id, t.name])
          : catalog.contactTags.map((t) => [t.id, t.name]);
  return { [NONE]: "— não definido —", ...Object.fromEntries(entries) };
}

/**
 * Configuração da automação de agendamento da clínica — os campos que o n8n
 * consome para mover cards, etiquetar e gravar datas na Helena.
 *
 * Até 2026-07-29 isso vivia só numa tabela do schema `public` mantida à mão. Aqui
 * o gestor escolhe cada campo a partir do que EXISTE na conta (as opções vêm da
 * API), e "Detectar da Helena" preenche o que der por nome — o mesmo casamento
 * que o workflow do n8n fazia, mas com revisão antes de salvar.
 */
export function ClinicAutomationConfig({ clinicId }: { clinicId: string }) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<AutomationSetup | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [detectionWarnings, setDetectionWarnings] = useState<string[] | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isDetecting, startDetect] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !setup) {
      startLoad(async () => {
        const res = await getAutomationSetup(clinicId);
        if (!res.ok) {
          toast.error(res.error);
          setOpen(false);
          return;
        }
        setSetup(res.setup);
        setEnabled(res.setup.enabled);
        setConfig(res.setup.config);
      });
    }
  }

  function handleDetect() {
    startDetect(async () => {
      const res = await detectAutomationForClinic(clinicId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Preenche só o que está vazio — detectar nunca desfaz escolha manual.
      let filled = 0;
      setConfig((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        for (const key of Object.keys(next) as AutomationFieldName[]) {
          if (!next[key] && res.detection.config[key]) {
            next[key] = res.detection.config[key];
            filled += 1;
          }
        }
        return next;
      });
      setDetectionWarnings(res.detection.warnings.map((w) => w.message));
      toast.success(
        filled > 0
          ? `${filled} campo(s) preenchidos pela detecção — revise e salve.`
          : "Nada novo para preencher: o que a detecção achou já estava definido.",
      );
    });
  }

  function handleSave() {
    if (!config) return;
    startSave(async () => {
      const res = await saveAutomationConfig(clinicId, { enabled, config });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.projectionWarning) {
        toast.warning("Salvo aqui, mas o espelho para o n8n falhou", {
          description: res.projectionWarning,
        });
      } else {
        toast.success("Automação salva e espelhada para o n8n.");
      }
    });
  }

  const missing = config
    ? (Object.keys(config) as AutomationFieldName[]).filter((f) => !config[f])
    : [];

  return (
    <div className="rounded-lg border border-border/50">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Workflow className="size-3.5" />
          Configurar automação de agendamento
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/50 p-3">
          {isLoading || !config || !setup ? (
            <p className="text-sm text-muted-foreground">Carregando a conta da Helena…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                O que o n8n usa para agendar nesta clínica. As opções são as que existem hoje na
                conta da Helena — o Clinic Control é a fonte da verdade e espelha para a tabela que
                os workflows leem.
              </p>

              {/* Liga/desliga + detectar: empilha no mobile */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="automation-enabled"
                    checked={enabled}
                    onCheckedChange={(v) => setEnabled(v)}
                  />
                  <Label htmlFor="automation-enabled" className="text-sm">
                    Automação ativa
                  </Label>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDetect}
                  disabled={isDetecting}
                  className="w-full sm:w-auto"
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Detectando…
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-3.5" /> Detectar da Helena
                    </>
                  )}
                </Button>
              </div>

              {setup.conflicts.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <ul className="space-y-1">
                    {setup.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h4 className="text-xs font-semibold text-foreground">{group.title}</h4>
                    <span className="text-[0.65rem] text-muted-foreground">{group.hint}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.fields.map((field) => {
                      const items = optionsFor(field, setup.catalog);
                      const hasOptions = Object.keys(items).length > 1;
                      return (
                        <div key={field} className="space-y-1">
                          <Label htmlFor={`aut-${field}`} className="text-xs text-muted-foreground">
                            {AUTOMATION_FIELD_LABEL[field]}
                          </Label>
                          <Select
                            value={config[field] ?? NONE}
                            items={items}
                            onValueChange={(v) =>
                              setConfig((prev) =>
                                prev ? { ...prev, [field]: v === NONE ? null : (v ?? null) } : prev,
                              )
                            }
                          >
                            <SelectTrigger
                              id={`aut-${field}`}
                              className="w-full"
                              disabled={!hasOptions}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(items).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!hasOptions && (
                            <p className="text-[0.65rem] text-amber-400/80">
                              Nada desse tipo cadastrado na conta da Helena.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {(detectionWarnings ?? setup.savedWarnings).length > 0 && (
                <details className="rounded-md border border-border/50 p-2.5 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {detectionWarnings
                      ? `Avisos da detecção (${detectionWarnings.length})`
                      : `Avisos da última varredura (${setup.savedWarnings.length})`}
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {(detectionWarnings ?? setup.savedWarnings).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[0.65rem] text-muted-foreground">
                  {missing.length === 0
                    ? "Todos os campos definidos."
                    : `${missing.length} campo(s) sem definição.`}
                  {setup.detectedAt &&
                    ` Última detecção: ${new Date(setup.detectedAt).toLocaleString("pt-BR")}.`}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full sm:w-auto"
                >
                  {isSaving ? "Salvando…" : "Salvar automação"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
