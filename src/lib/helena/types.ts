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
}
