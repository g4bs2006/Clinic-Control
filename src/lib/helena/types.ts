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
  customFields?: Record<string, unknown>;
  /** Sessão de chat que originou o card (usado no relatório de conversas). */
  sessionId?: string | null;
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
