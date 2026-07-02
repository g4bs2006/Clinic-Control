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
  customFields?: Record<string, any>;
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
