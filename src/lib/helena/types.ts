export interface HelenaPanel {
  id: string;
  title: string;
  key: string;
  companyId: string;
}

export interface HelenaStep {
  id: string;
  title: string;
  position: number;
  cardCount: number;
  monetaryAmount: number;
}

export interface HelenaCard {
  id: string;
  stepId: string;
  title: string;
  monetaryAmount: number | null;
  createdAt: string;
  tagIds: string[];
  customFields?: Record<string, unknown>;
}

/**
 * Etiqueta de card do CRM — vem embutida no painel via
 * GET /crm/v1/panel/{id}?IncludeDetails=Tags. Catálogo por PAINEL, distinto
 * do catálogo de etiquetas de contato (GET /core/v1/tag).
 */
export interface HelenaTag {
  id: string;
  name: string;
}

/**
 * Campo personalizado de um painel do CRM — GET /crm/v1/panel/{id}/custom-fields.
 * O identificador usado para gravar valor no card é a `key` (string), não o id;
 * é ela que a automação de agendamento guarda.
 */
export interface HelenaCustomField {
  key: string;
  name: string;
}

export interface HelenaCompany {
  id: string;
  name: string | null;
  legalName: string | null;
  status: string;
  setupStatus: string;
}

export interface HelenaDepartment {
  id: string;
  name: string;
}

export interface HelenaAgent {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
}

export interface HelenaChannel {
  id: string;
  name: string;
  type: string;
  status: string;
}

/** Conta completa como vem de GET /core/v1/company (token master/parceiro). */
export interface HelenaCompanyFull {
  id: string;
  name: string | null;
  legalName: string | null;
  documentId: string | null;
  email: string | null;
  phoneNumberFormatted: string | null;
  setupStatus: string | null;
  active: boolean;
  createdAt: string | null;
  config: Record<string, unknown> | null;
}

/** Metadados de um token de integração — o VALOR nunca é persistido. */
export interface HelenaTokenMeta {
  id: string;
  name: string | null;
  createdAt: string | null;
}

export interface HelenaWebhookSubscription {
  id: string;
  name: string | null;
  url: string;
  enabled: boolean;
  events: string[];
}
