"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  Workflow,
  Wand2,
  Loader2,
  RotateCw,
  Send,
  Database,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getAutomationDiagnostics,
  saveAutomationConfig,
  detectAutomationForClinic,
  redetectAutomationField,
  reprojectAutomation,
  type AutomationDiagnostics,
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

const SOURCE_LABEL: Record<string, string> = {
  step: "etapa do painel",
  panelTag: "etiqueta de card",
  contactTag: "etiqueta de contato",
  customField: "campo personalizado",
};

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
 * o gestor vê, por campo: o valor CRU que está no banco, o nome que esse id tem
 * na Helena hoje, se ele virou órfão (aponta para painel/coluna que não existe
 * mais) e o que a tabela do n8n está lendo naquele campo. Dá para trocar, refazer
 * a busca de um campo só e reenviar para o n8n.
 */
export function ClinicAutomationConfig({
  clinicId,
  label = "Automação de agendamento",
  n8nUrl = null,
}: {
  clinicId: string;
  /** Rótulo do cabeçalho recolhível. Fica recolhido de propósito: abrir dispara
   *  4 chamadas à API da Helena, e a página da clínica não deve pagar isso no
   *  carregamento (ver clinic-control-otimizacao). */
  label?: string;
  /** Link do workflow no n8n (clinics.n8n_url). Aparece FORA do recolhível, para
   *  poder abrir o workflow sem disparar as chamadas à Helena. Editar é na Ficha
   *  da clínica — aqui é só atalho. */
  n8nUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<AutomationDiagnostics | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [detectionWarnings, setDetectionWarnings] = useState<string[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [busyField, setBusyField] = useState<AutomationFieldName | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isDetecting, startDetect] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isSending, startSend] = useTransition();

  // Uma action só: o diagnóstico já traz catálogo + config. Antes eram duas em
  // paralelo, e cada uma carregava o MESMO catálogo da Helena — abrir o painel
  // custava 6 chamadas à API em vez de 3.
  async function load() {
    const d = await getAutomationDiagnostics(clinicId);
    if (!d.ok) {
      toast.error(d.error);
      setOpen(false);
      return;
    }
    setDiag(d.diagnostics);
    setEnabled(d.diagnostics.enabled);
    setConfig(d.diagnostics.config);
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !diag) startLoad(load);
  }

  function handleDetect() {
    startDetect(async () => {
      const res = await detectAutomationForClinic(clinicId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Preenche só o que está vazio — o detectar geral nunca desfaz escolha
      // manual. Para sobrescrever um campo específico existe o botão por campo.
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

  async function handleRedetectField(field: AutomationFieldName) {
    setBusyField(field);
    try {
      const res = await redetectAutomationField(clinicId, field);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (!res.value) {
        toast.warning(`${AUTOMATION_FIELD_LABEL[field]}: nada escolhido`, {
          description:
            res.candidates.length > 0
              ? `${res.candidates.length} candidatas na Helena — escolha na lista: ${res.candidates.map((c) => c.label).join(" | ")}`
              : "Nenhuma candidata encontrada na Helena com esse nome.",
        });
        return;
      }
      setConfig((prev) => (prev ? { ...prev, [field]: res.value } : prev));
      toast.success(`${AUTOMATION_FIELD_LABEL[field]} → “${res.label}”`, {
        description: "Ainda não salvo — confirme com Salvar automação.",
      });
    } finally {
      setBusyField(null);
    }
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
      // Recarrega o diagnóstico: os "diferente do n8n" tinham que sumir.
      const d = await getAutomationDiagnostics(clinicId);
      if (d.ok) setDiag(d.diagnostics);
      setDetectionWarnings(null);
    });
  }

  function handleReproject() {
    startSend(async () => {
      const res = await reprojectAutomation(clinicId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Configuração reenviada para a tabela do n8n.");
      const d = await getAutomationDiagnostics(clinicId);
      if (d.ok) setDiag(d.diagnostics);
    });
  }

  const missing = config
    ? (Object.keys(config) as AutomationFieldName[]).filter((f) => !config[f])
    : [];
  const diagByField = new Map((diag?.fields ?? []).map((f) => [f.field, f]));

  return (
    <div className="space-y-2">
      {n8nUrl && (
        <a
          href={n8nUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-xs text-brand hover:underline"
          title={n8nUrl}
        >
          <ExternalLink className="size-3.5 shrink-0" />
          <span className="truncate">Abrir o workflow desta clínica no n8n</span>
        </a>
      )}

      <div className="rounded-lg border border-border/50">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Workflow className="size-3.5" />
          {label}
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/50 p-3">
          {isLoading || !config || !diag ? (
            <p className="text-sm text-muted-foreground">Carregando a conta da Helena…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                O que o n8n usa para agendar nesta clínica. As opções são as que existem hoje na
                conta da Helena — o Clinic Control é a fonte da verdade e espelha para a tabela que
                os workflows leem.
              </p>

              {/* Liga/desliga + ações. Empilha no mobile. */}
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
                <div className="flex flex-col gap-2 sm:flex-row">
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
                        <Wand2 className="size-3.5" /> Detectar vazios
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleReproject}
                    disabled={isSending}
                    className="w-full sm:w-auto"
                    title="Reenvia o que está salvo para a tabela do n8n, sem alterar nada aqui"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Enviando…
                      </>
                    ) : (
                      <>
                        <Send className="size-3.5" /> Reenviar ao n8n
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Estado do espelho no n8n — "o que está no banco de dados" do outro lado */}
              <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Database className="size-3.5" />
                      Tabela do n8n
                    </span>
                    {diag.mirror.exists ? (
                      <>
                        <span className="text-muted-foreground">
                          nome: <span className="text-foreground">{diag.mirror.nome ?? "—"}</span>
                        </span>
                        <span className="text-muted-foreground">
                          ativo:{" "}
                          <span className="text-foreground">{diag.mirror.ativo ? "sim" : "não"}</span>
                        </span>
                        {diag.mirror.updatedAt && (
                          <span className="text-muted-foreground">
                            atualizada em{" "}
                            {new Date(diag.mirror.updatedAt).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-400">
                        sem linha para esta clínica — salve para criar
                      </span>
                    )}
                  </div>
                  {diag.mirror.panelDrifted && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      O n8n aponta para o painel{" "}
                      <code className="font-mono">{diag.mirror.panelId}</code> e o app usa{" "}
                      <code className="font-mono">{diag.panelId}</code>. A automação e as métricas
                      estão olhando painéis diferentes — precisa de decisão manual.
                    </p>
                  )}
                  {diag.mirror.statusObs && diag.mirror.statusObs !== "ok" && (
                    <p className="mt-1.5 text-muted-foreground">
                      <span className="font-medium">status_obs:</span> {diag.mirror.statusObs}
                    </p>
                  )}
              </div>

              {diag.conflicts.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <ul className="space-y-1">
                    {diag.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {missing.length === 0
                    ? "Todos os 13 campos definidos."
                    : `${missing.length} de 13 campos sem definição.`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {showRaw ? "esconder ids" : "mostrar ids do banco"}
                </button>
              </div>

              {GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h4 className="text-xs font-semibold text-foreground">{group.title}</h4>
                    <span className="text-[0.65rem] text-muted-foreground">{group.hint}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.fields.map((field) => {
                      const items = optionsFor(field, diag.catalog);
                      const hasOptions = Object.keys(items).length > 1;
                      const fd = diagByField.get(field);
                      const dirty = fd ? (config[field] ?? null) !== fd.stored : false;
                      return (
                        <div key={field} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label
                              htmlFor={`aut-${field}`}
                              className="text-xs text-muted-foreground"
                            >
                              {AUTOMATION_FIELD_LABEL[field]}
                            </Label>
                            <button
                              type="button"
                              onClick={() => handleRedetectField(field)}
                              disabled={busyField === field}
                              title="Refazer a busca deste campo na Helena (sobrescreve o valor atual)"
                              aria-label={`Redetectar ${AUTOMATION_FIELD_LABEL[field]}`}
                              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                              {busyField === field ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RotateCw className="size-3.5" />
                              )}
                            </button>
                          </div>
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

                          {/* Procedência: de qual catálogo vem, id cru, órfão, e o
                              que o n8n lê hoje. É o "destrinchado" do campo. */}
                          <div className="space-y-0.5 text-[0.65rem] leading-tight">
                            {!hasOptions && (
                              <p className="text-amber-400/80">
                                Nada desse tipo cadastrado na conta da Helena.
                              </p>
                            )}
                            {fd?.orphan && (
                              <p className="text-red-400">
                                O id gravado não existe no painel vinculado — aponta para outro
                                painel ou foi apagado na Helena.
                              </p>
                            )}
                            {fd?.drifted && !dirty && (
                              <p className="text-amber-400/90">
                                No n8n está {fd.mirrored ? "outro valor" : "vazio"} — use “Reenviar
                                ao n8n”.
                              </p>
                            )}
                            {dirty && <p className="text-brand">alterado, ainda não salvo</p>}
                            {showRaw && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className="shrink-0">
                                  {SOURCE_LABEL[AUTOMATION_FIELD_SOURCE[field]]} ·
                                </span>
                                <code className="truncate font-mono" title={config[field] ?? ""}>
                                  {config[field] ?? "null"}
                                </code>
                                {config[field] && (
                                  <CopyButton
                                    value={config[field] as string}
                                    label={`id de ${AUTOMATION_FIELD_LABEL[field]}`}
                                    className="size-5"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {(detectionWarnings ?? diag.warnings).length > 0 && (
                <details className="rounded-md border border-border/50 p-2.5 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {detectionWarnings
                      ? `Avisos da detecção (${detectionWarnings.length})`
                      : `Avisos da última varredura (${diag.warnings.length})`}
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {(detectionWarnings ?? diag.warnings).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[0.65rem] text-muted-foreground">
                  {diag.detectedAt
                    ? `Última varredura: ${new Date(diag.detectedAt).toLocaleString("pt-BR")}.`
                    : "Nunca varrida."}
                  {diag.companyId && ` company ${diag.companyId.slice(0, 8)}…`}
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
    </div>
  );
}
