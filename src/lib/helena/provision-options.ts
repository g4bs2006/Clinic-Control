// Opções da conta Helena escolhidas na criação da clínica (módulo puro —
// importável de client e server). A doc da Helena marca `apps` e `resourcers`
// como opcionais no POST /core/v1/company, mas na prática são OBRIGATÓRIOS
// (sem eles a API responde 500 ERROR_UNEXPECTED) — descoberto por sonda em
// 2026-07-03.

/** Apps habilitáveis na conta (enum da Helena, rótulos nossos). */
export const HELENA_APPS = [
  { value: "PANEL", label: "Painéis (CRM)" },
  { value: "WEBHOOK", label: "Webhooks" },
  { value: "AI_AGENT", label: "Agentes de IA" },
  { value: "DIALOG", label: "Chatbots (diálogos)" },
  { value: "CAMPAIGN", label: "Campanhas" },
  { value: "SEQUENCE", label: "Sequências" },
  { value: "SCHEDULED_MESSAGE", label: "Mensagens agendadas" },
  { value: "GROUP", label: "Grupos" },
  { value: "TRANSCRIPTION", label: "Transcrição de áudio" },
  { value: "PAYMENT", label: "Pagamentos" },
  { value: "MESSAGE_DELAY", label: "Atraso de mensagens" },
  { value: "SESSION_REASON", label: "Motivos de sessão" },
  { value: "SESSION_DISTRIBUTION", label: "Distribuição de sessões" },
  { value: "CONTACT_PORTFOLIO", label: "Carteira de contatos" },
] as const;

/** Tipos de empresa aceitos pela Helena (enum `type`). */
export const HELENA_COMPANY_TYPES = [
  { value: "LIMITED", label: "Sociedade Limitada (Ltda.)" },
  { value: "MEI", label: "MEI" },
  { value: "INDIVIDUAL", label: "Empresa Individual" },
  { value: "ASSOCIATION", label: "Associação" },
  { value: "UNDEFINED", label: "Não definido" },
] as const;

/** Recursos avançados (enum `resourcers` da Helena). */
export const HELENA_RESOURCERS = [
  { value: "WEBHOOK_API", label: "API de Webhooks" },
  { value: "CUSTOM_FIELDS", label: "Campos personalizados" },
  { value: "INSTA_MESSENGER_CHANNELS", label: "Canais Instagram/Messenger" },
  { value: "UNOFFICIAL_CHANNELS_ENABLED", label: "Canais não-oficiais" },
] as const;

/**
 * Limites de recursos (objeto `config` da Helena). Defaults espelham o plano
 * típico das contas reais da carteira. Obs.: sessões têm mínimo de 1000 no
 * backend da Helena (valores menores são elevados).
 */
export const HELENA_CONFIG_FIELDS = [
  { key: "whatsAppChannels", label: "Canais WhatsApp", default: 3 },
  { key: "instagramChannels", label: "Canais Instagram", default: 1 },
  { key: "messengerChannels", label: "Canais Messenger", default: 1 },
  { key: "panels", label: "Painéis", default: 3 },
  { key: "agents", label: "Usuários (atendentes)", default: 3 },
  { key: "aiAgents", label: "Agentes de IA", default: 1 },
  { key: "chatBots", label: "Chatbots", default: 3 },
  { key: "chatbotAutomations", label: "Automações de chatbot", default: 3 },
  { key: "sequences", label: "Sequências", default: 3 },
  { key: "session", label: "Sessões incluídas", default: 1000 },
] as const;

export type HelenaConfigKey = (typeof HELENA_CONFIG_FIELDS)[number]["key"];

export interface HelenaProvisionOptions {
  apps: string[];
  resourcers: string[];
  config: Record<string, number>;
  /** Tipo da empresa na Helena (enum HELENA_COMPANY_TYPES). */
  companyType: string;
}

export const DEFAULT_PROVISION_OPTIONS: HelenaProvisionOptions = {
  apps: ["PANEL", "WEBHOOK", "AI_AGENT", "DIALOG", "CAMPAIGN", "SEQUENCE", "SCHEDULED_MESSAGE", "GROUP"],
  resourcers: ["WEBHOOK_API", "CUSTOM_FIELDS"],
  config: Object.fromEntries(HELENA_CONFIG_FIELDS.map((f) => [f.key, f.default])),
  companyType: "LIMITED",
};

/**
 * Valida opções vindas do form ou do jsonb do banco, filtrando valores fora
 * do enum. `apps` nunca sai vazio (a API exige) — cai para o default.
 */
export function normalizeProvisionOptions(raw: unknown): HelenaProvisionOptions {
  const o = (raw ?? {}) as Partial<HelenaProvisionOptions>;
  const validApps = new Set<string>(HELENA_APPS.map((a) => a.value));
  const validRes = new Set<string>(HELENA_RESOURCERS.map((r) => r.value));
  const validKeys = new Set<string>(HELENA_CONFIG_FIELDS.map((f) => f.key));
  const validTypes = new Set<string>(HELENA_COMPANY_TYPES.map((t) => t.value));

  const apps = Array.isArray(o.apps) ? o.apps.filter((a) => validApps.has(a)) : [];
  const resourcers = Array.isArray(o.resourcers) ? o.resourcers.filter((r) => validRes.has(r)) : [];
  const config: Record<string, number> = {};
  if (o.config && typeof o.config === "object") {
    for (const [k, v] of Object.entries(o.config)) {
      const n = Number(v);
      if (validKeys.has(k) && Number.isFinite(n) && n >= 0) config[k] = Math.floor(n);
    }
  }

  return {
    apps: apps.length > 0 ? apps : [...DEFAULT_PROVISION_OPTIONS.apps],
    resourcers,
    config: Object.keys(config).length > 0 ? config : { ...DEFAULT_PROVISION_OPTIONS.config },
    companyType:
      typeof o.companyType === "string" && validTypes.has(o.companyType)
        ? o.companyType
        : DEFAULT_PROVISION_OPTIONS.companyType,
  };
}
