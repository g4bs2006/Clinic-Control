import type { HelenaStep, HelenaCard } from "./types";

export const CANONICAL_STEPS = [
  "Leads", "Agendados", "Não Agendados", "Reagendados", "Cancelados",
  "Faltosos", "Orçamento em Aberto", "Compareceram e Não Fecharam", "Compareceram e Fecharam",
];

const CLOSING = "Compareceram e Fecharam";

export function buildLiveFunnel(steps: HelenaStep[], monthCards: HelenaCard[]) {
  const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
  const countByTitle = new Map<string, number>();
  let revenue = 0;
  let leads = 0;
  for (const card of monthCards) {
    const title = titleByStepId.get(card.stepId);
    if (!title) continue;
    leads++;
    countByTitle.set(title, (countByTitle.get(title) ?? 0) + 1);
    if (title === CLOSING) revenue += card.monetaryAmount ?? 0;
  }
  const outSteps = CANONICAL_STEPS.map((title) => ({ title, count: countByTitle.get(title) ?? 0 }));
  const scheduled = countByTitle.get("Agendados") ?? 0;
  const rate = leads === 0 ? 0 : scheduled / leads;
  return { steps: outSteps, leads, scheduled, rate, revenue };
}
