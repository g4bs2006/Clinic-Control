import type { HelenaStep, HelenaCard } from "./types";

export const CANONICAL_STEPS = [
  "Leads", "Agendados", "Não Agendados", "Reagendados", "Cancelados",
  "Faltosos", "Orçamento em Aberto", "Compareceram e Não Fecharam", "Compareceram e Fecharam",
];

const CLOSING = "Compareceram e Fecharam";

// Etapas que implicam "já agendou" em algum momento. O card ocupa uma única
// etapa por vez (Kanban) — quem avança sai de "Agendados", então contar só
// essa etapa subestima quem já agendou e progrediu no funil no mesmo mês.
const SCHEDULED_TITLES = new Set([
  "Agendados",
  "Reagendados",
  "Faltosos",
  "Compareceram e Não Fecharam",
  "Orçamento em Aberto",
  "Compareceram e Fecharam",
]);

export function buildLiveFunnel(steps: HelenaStep[], monthCards: HelenaCard[]) {
  const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
  const countByTitle = new Map<string, number>();
  let revenue = 0;
  let leads = 0;
  let scheduled = 0;
  for (const card of monthCards) {
    const title = titleByStepId.get(card.stepId);
    if (!title) continue;
    leads++;
    countByTitle.set(title, (countByTitle.get(title) ?? 0) + 1);
    if (SCHEDULED_TITLES.has(title)) scheduled++;
    if (title === CLOSING) revenue += card.monetaryAmount ?? 0;
  }
  const outSteps = CANONICAL_STEPS.map((title) => ({ title, count: countByTitle.get(title) ?? 0 }));
  const rate = leads === 0 ? 0 : scheduled / leads;
  return { steps: outSteps, leads, scheduled, rate, revenue };
}

export type DailyFunnelPoint = { day: string; leads: number; scheduled: number; rate: number | null };

/**
 * Bucketiza os cards por dia de criação (UTC) dentro do mês informado.
 * Preenche todos os dias do mês (ou até hoje, se for o mês corrente) —
 * dias sem nenhum lead entram com rate=null (sem dado, não 0%).
 */
export function buildDailyFunnel(
  steps: HelenaStep[],
  monthCards: HelenaCard[],
  yearMonth: string,
  today: Date = new Date(),
): DailyFunnelPoint[] {
  const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
  const byDay = new Map<string, { leads: number; scheduled: number }>();
  for (const card of monthCards) {
    const title = titleByStepId.get(card.stepId);
    if (!title) continue;
    const day = card.createdAt.slice(0, 10);
    const bucket = byDay.get(day) ?? { leads: 0, scheduled: 0 };
    bucket.leads++;
    if (SCHEDULED_TITLES.has(title)) bucket.scheduled++;
    byDay.set(day, bucket);
  }

  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const isCurrentMonth =
    yearMonth === `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastDay = isCurrentMonth ? today.getUTCDate() : daysInMonth;

  const points: DailyFunnelPoint[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const day = `${yearMonth}-${String(d).padStart(2, "0")}`;
    const bucket = byDay.get(day);
    points.push({
      day,
      leads: bucket?.leads ?? 0,
      scheduled: bucket?.scheduled ?? 0,
      rate: bucket && bucket.leads > 0 ? bucket.scheduled / bucket.leads : null,
    });
  }
  return points;
}
