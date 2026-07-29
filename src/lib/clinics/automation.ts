// Detecção da configuração da automação de agendamento a partir do que existe
// na conta Helena da clínica. Lógica PURA (sem I/O) — o I/O fica nas actions.
//
// Isto é a porta da heurística que vivia no node "Montar Linha1" do workflow do
// n8n: casar por NOME (normalizado sem acento/caixa) as etapas do painel, os
// campos personalizados e os dois catálogos de etiqueta (card e contato).
//
// Diferença deliberada em relação ao workflow: quando o nome casa com 0 ou com
// mais de 1 candidata, lá o campo ficava `null` e o motivo virava uma string em
// `status_obs` que ninguém lia. Aqui a ambiguidade é devolvida como CANDIDATAS,
// para a UI oferecer a escolha ao gestor — o aviso deixa de ser o fim da linha.

export type AutomationStepOption = { id: string; title: string; position: number };
export type AutomationTagOption = { id: string; name: string };
export type AutomationFieldOption = { key: string; name: string };

/** Os 13 campos que a automação consome, todos opcionais até serem resolvidos. */
export type AutomationConfig = {
  leadStepId: string | null;
  scheduledStepId: string | null;
  cancelledStepId: string | null;
  iaCardTagId: string | null;
  scheduledContactTagId: string | null;
  scheduledAtFieldKey: string | null;
  scheduledForFieldKey: string | null;
  fbPanelTagId: string | null;
  fbContactTagId: string | null;
  igPanelTagId: string | null;
  igContactTagId: string | null;
  orgPanelTagId: string | null;
  orgContactTagId: string | null;
};

export type AutomationFieldName = keyof AutomationConfig;

export const AUTOMATION_FIELDS: AutomationFieldName[] = [
  "leadStepId",
  "scheduledStepId",
  "cancelledStepId",
  "iaCardTagId",
  "scheduledContactTagId",
  "scheduledAtFieldKey",
  "scheduledForFieldKey",
  "fbPanelTagId",
  "fbContactTagId",
  "igPanelTagId",
  "igContactTagId",
  "orgPanelTagId",
  "orgContactTagId",
];

/** Rótulo humano de cada campo — usado nos avisos e na UI. */
export const AUTOMATION_FIELD_LABEL: Record<AutomationFieldName, string> = {
  leadStepId: "Etapa de chegada (Leads)",
  scheduledStepId: "Etapa Agendados",
  cancelledStepId: "Etapa Cancelados",
  iaCardTagId: "Etiqueta de card “IA”",
  scheduledContactTagId: "Etiqueta de contato “Agendou IA”",
  scheduledAtFieldKey: "Campo “Agendado em”",
  scheduledForFieldKey: "Campo “Agendado para”",
  fbPanelTagId: "Etiqueta de card Facebook",
  fbContactTagId: "Etiqueta de contato Facebook",
  igPanelTagId: "Etiqueta de card Instagram",
  igContactTagId: "Etiqueta de contato Instagram",
  orgPanelTagId: "Etiqueta de card Orgânico",
  orgContactTagId: "Etiqueta de contato Orgânico",
};

/** De qual catálogo cada campo escolhe — a UI monta o Select certo a partir disto. */
export const AUTOMATION_FIELD_SOURCE: Record<
  AutomationFieldName,
  "step" | "panelTag" | "contactTag" | "customField"
> = {
  leadStepId: "step",
  scheduledStepId: "step",
  cancelledStepId: "step",
  iaCardTagId: "panelTag",
  scheduledContactTagId: "contactTag",
  scheduledAtFieldKey: "customField",
  scheduledForFieldKey: "customField",
  fbPanelTagId: "panelTag",
  fbContactTagId: "contactTag",
  igPanelTagId: "panelTag",
  igContactTagId: "contactTag",
  orgPanelTagId: "panelTag",
  orgContactTagId: "contactTag",
};

export type AutomationCatalog = {
  steps: AutomationStepOption[];
  customFields: AutomationFieldOption[];
  panelTags: AutomationTagOption[];
  contactTags: AutomationTagOption[];
};

/**
 * Aviso amarrado ao CAMPO que o gerou. É por isso que não é só uma string: um
 * aviso de "nenhuma candidata" para um campo que o gestor já preencheu à mão é
 * ruído, e sem o campo não há como filtrar (ver warningsForEmptyFields).
 */
export type AutomationWarning = { field: AutomationFieldName; message: string };

export type AutomationDetection = {
  /** O que a heurística conseguiu resolver sem ambiguidade. */
  config: AutomationConfig;
  warnings: AutomationWarning[];
  /** Candidatas por campo quando havia 0 (lista vazia) ou >1 (lista com as opções). */
  candidates: Partial<Record<AutomationFieldName, { id: string; label: string }[]>>;
};

/** Sem acento, sem caixa, sem espaço nas pontas — igual ao `norm` do workflow. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const EMPTY_AUTOMATION_CONFIG: AutomationConfig = {
  leadStepId: null,
  scheduledStepId: null,
  cancelledStepId: null,
  iaCardTagId: null,
  scheduledContactTagId: null,
  scheduledAtFieldKey: null,
  scheduledForFieldKey: null,
  fbPanelTagId: null,
  fbContactTagId: null,
  igPanelTagId: null,
  igContactTagId: null,
  orgPanelTagId: null,
  orgContactTagId: null,
};

type Candidate = { id: string; label: string };

/**
 * Detecta a configuração casando nomes. As regras vieram do workflow do n8n em
 * produção, incluindo a assimetria entre elas (que é intencional, não descuido):
 * etapa casa por nome EXATO — "Agendados" e "Agendados (retorno)" são colunas
 * diferentes e confundi-las moveria o card para o lugar errado; campo e etiqueta
 * de origem casam por CONTÉM, porque as contas escrevem "Agendado em:",
 * "Lead Facebook", "Facebook Ads" etc.
 */
export function detectAutomation(catalog: AutomationCatalog): AutomationDetection {
  const config: AutomationConfig = { ...EMPTY_AUTOMATION_CONFIG };
  const warnings: AutomationWarning[] = [];
  const candidates: AutomationDetection["candidates"] = {};

  function resolve(field: AutomationFieldName, matches: Candidate[]) {
    if (matches.length === 1) {
      config[field] = matches[0].id;
      return;
    }
    candidates[field] = matches;
    warnings.push({
      field,
      message:
        matches.length === 0
          ? `${AUTOMATION_FIELD_LABEL[field]}: nenhuma candidata encontrada na Helena.`
          : `${AUTOMATION_FIELD_LABEL[field]}: ${matches.length} candidatas — ${matches
              .map((m) => m.label)
              .join(" | ")}.`,
    });
  }

  const stepsByExactTitle = (title: string): Candidate[] =>
    catalog.steps
      .filter((s) => normalizeName(s.title) === title)
      .map((s) => ({ id: s.id, label: s.title }));

  const fieldsContaining = (needle: string): Candidate[] =>
    catalog.customFields
      .filter((f) => normalizeName(f.name).includes(needle))
      .map((f) => ({ id: f.key, label: f.name }));

  const tagsWhere = (
    list: AutomationTagOption[],
    pred: (normalized: string) => boolean,
  ): Candidate[] =>
    list.filter((t) => pred(normalizeName(t.name))).map((t) => ({ id: t.id, label: t.name }));

  resolve("leadStepId", stepsByExactTitle("leads"));
  resolve("scheduledStepId", stepsByExactTitle("agendados"));
  resolve("cancelledStepId", stepsByExactTitle("cancelados"));

  resolve("scheduledAtFieldKey", fieldsContaining("agendado em"));
  resolve("scheduledForFieldKey", fieldsContaining("agendado para"));

  resolve("iaCardTagId", tagsWhere(catalog.panelTags, (n) => n === "ia"));
  resolve(
    "scheduledContactTagId",
    tagsWhere(catalog.contactTags, (n) => n.includes("agendou ia")),
  );

  const ORIGINS: { keyword: string; panel: AutomationFieldName; contact: AutomationFieldName }[] = [
    { keyword: "facebook", panel: "fbPanelTagId", contact: "fbContactTagId" },
    { keyword: "instagram", panel: "igPanelTagId", contact: "igContactTagId" },
    { keyword: "organico", panel: "orgPanelTagId", contact: "orgContactTagId" },
  ];
  for (const o of ORIGINS) {
    resolve(o.panel, tagsWhere(catalog.panelTags, (n) => n.includes(o.keyword)));
    resolve(o.contact, tagsWhere(catalog.contactTags, (n) => n.includes(o.keyword)));
  }

  return { config, warnings, candidates };
}

/**
 * Mensagens de aviso que ainda importam: só as de campos que continuam vazios
 * na configuração final. Se o gestor já escolheu à mão, o fato de a heurística
 * não ter achado nada é irrelevante e só polui o painel.
 */
export function warningsForEmptyFields(
  warnings: AutomationWarning[],
  config: AutomationConfig,
): string[] {
  return warnings.filter((w) => !config[w.field]).map((w) => w.message);
}

/**
 * Funde a detecção na configuração salva SEM sobrescrever escolha humana: só
 * preenche campo que está vazio. É o que permite rodar a varredura em lote sem
 * medo de desfazer ajuste manual.
 */
export function mergeDetectionIntoEmpty(
  saved: AutomationConfig,
  detected: AutomationConfig,
): { config: AutomationConfig; filled: AutomationFieldName[] } {
  const config = { ...saved };
  const filled: AutomationFieldName[] = [];
  for (const f of AUTOMATION_FIELDS) {
    if (!config[f] && detected[f]) {
      config[f] = detected[f];
      filled.push(f);
    }
  }
  return { config, filled };
}

/** Campos ainda vazios numa configuração. */
export function missingAutomationFields(config: AutomationConfig): AutomationFieldName[] {
  return AUTOMATION_FIELDS.filter((f) => !config[f]);
}

export type AutomationReadiness = "completa" | "parcial" | "vazia";

export function automationReadiness(config: AutomationConfig): AutomationReadiness {
  const missing = missingAutomationFields(config);
  if (missing.length === 0) return "completa";
  return missing.length === AUTOMATION_FIELDS.length ? "vazia" : "parcial";
}

/**
 * Incoerências entre a automação (escrita, campo singular) e o mapeamento do
 * funil (leitura, arrays) da MESMA clínica. Ninguém cruzava esses dois lados
 * antes, e eles discordarem é silencioso: a automação move o card para uma
 * coluna que a métrica não conta como agendamento, então a clínica agenda e a
 * taxa não sobe.
 */
export function automationFunnelConflicts(
  config: AutomationConfig,
  funnel: {
    scheduledStepIds: string[] | null;
    leadStepIds: string[] | null;
  },
  steps: AutomationStepOption[],
): string[] {
  const out: string[] = [];
  const titleOf = (id: string) => steps.find((s) => s.id === id)?.title ?? id;

  // Só compara quando o mapeamento de leitura existe — array vazio/null significa
  // "clínica sem mapeamento", que cai no fallback por título e não é conflito.
  const scheduled = funnel.scheduledStepIds;
  if (config.scheduledStepId && scheduled && scheduled.length > 0) {
    if (!scheduled.includes(config.scheduledStepId)) {
      out.push(
        `A automação move o card para “${titleOf(config.scheduledStepId)}”, mas essa coluna não está marcada como “Agendado” no mapeamento do funil — os agendamentos feitos pela automação não entram na taxa.`,
      );
    }
  }

  // O inverso do aviso que já existe no mapeamento de colunas: aqui o risco é a
  // automação usar a coluna de chegada como destino de agendamento.
  if (
    config.scheduledStepId &&
    config.leadStepId &&
    config.scheduledStepId === config.leadStepId
  ) {
    out.push(
      `A etapa de chegada e a de agendamento são a mesma coluna (“${titleOf(config.leadStepId)}”) — todo lead que chega contaria como agendado.`,
    );
  }

  return out;
}
