import type { HelenaStep, HelenaCard } from "./types";

export const CANONICAL_STEPS = [
  "Leads", "Agendados", "Não Agendados", "Reagendados", "Cancelados",
  "Faltosos", "Orçamento em Aberto", "Compareceram e Não Fecharam", "Compareceram e Fecharam",
];

const CLOSING = "Compareceram e Fecharam";
const NOSHOW = "Faltosos";
const NOT_SCHEDULED = "Não Agendados";
const ATTENDED_TITLES = new Set(["Compareceram e Não Fecharam", "Compareceram e Fecharam"]);

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

/**
 * Mapeamento por clínica de quais colunas (steps) do painel correspondem a cada
 * bucket do funil. Substitui a classificação canônica por título quando presente.
 * - scheduledStepIds: colunas que contam como "agendado".
 * - closingStepIds:   colunas de fechamento (faturamento = soma do valor dos cards).
 *   Fechamento é tratado como subconjunto de "agendado": um card em coluna de
 *   fechamento também conta como agendado, mesmo que a coluna não esteja em
 *   scheduledStepIds — evita subcontar a taxa.
 * - noshowStepIds:    colunas de "faltou" (agendou e não compareceu). Também
 *   subconjunto de "agendado" (quem faltou agendou em algum momento); alimentam
 *   o No-show = faltas / agendados.
 * - notScheduledStepIds: colunas de "não agendou" (lead que não chegou a
 *   agendar). NÃO contam como agendado; alimentam Não agendados / leads.
 * - attendedStepIds:  colunas de "compareceu". Subconjunto de "agendado"; as
 *   colunas de fechamento contam automaticamente como compareceu (quem fechou
 *   compareceu). Alimentam Comparecimento = compareceu/agendados e o
 *   denominador de Fechamento = fechados/compareceu.
 * - leadStepIds:      colunas de "chegada de leads" (informativo; leads = todos
 *   os cards do painel, então não altera a contagem de leads).
 */
export type FunnelMapping = {
  scheduledStepIds: string[];
  closingStepIds?: string[];
  noshowStepIds?: string[];
  notScheduledStepIds?: string[];
  attendedStepIds?: string[];
  leadStepIds?: string[];
};

/**
 * Segunda dimensão do funil, ortogonal ao FunnelMapping por coluna: quem
 * realizou o agendamento, via ETIQUETA do card (não a coluna). Só se aplica a
 * cards já classificados como "agendado" pelo FunnelMapping/fallback canônico.
 * Sem convenção de nome entre clínicas — não há fallback, só o que o gestor
 * configurar. Um card agendado com etiqueta desconhecida (removida da conta)
 * ou sem nenhuma das duas cai em "não classificado".
 */
export type SchedulerTagMapping = {
  crcTagIds: string[];
  iaTagIds: string[];
};

// Resolve as funções de classificação a partir do mapping (por stepId) ou, na
// ausência dele, do comportamento canônico por título de etapa.
function resolveClassifier(
  steps: HelenaStep[],
  mapping?: FunnelMapping | null,
): {
  isScheduled: (stepId: string, title: string | undefined) => boolean;
  isClosing: (stepId: string, title: string | undefined) => boolean;
  isNoShow: (stepId: string, title: string | undefined) => boolean;
  isNotScheduled: (stepId: string, title: string | undefined) => boolean;
  isAttended: (stepId: string, title: string | undefined) => boolean;
} {
  if (mapping && mapping.scheduledStepIds) {
    const scheduled = new Set(mapping.scheduledStepIds);
    const closing = new Set(mapping.closingStepIds ?? []);
    const noshow = new Set(mapping.noshowStepIds ?? []);
    const notScheduled = new Set(mapping.notScheduledStepIds ?? []);
    const attended = new Set(mapping.attendedStepIds ?? []);
    return {
      // Hierarquia de subconjuntos: fechou ⊂ compareceu ⊂ agendado; faltou ⊂ agendado.
      isScheduled: (stepId) =>
        scheduled.has(stepId) || closing.has(stepId) || noshow.has(stepId) || attended.has(stepId),
      isClosing: (stepId) => closing.has(stepId),
      isNoShow: (stepId) => noshow.has(stepId),
      isNotScheduled: (stepId) => notScheduled.has(stepId),
      isAttended: (stepId) => attended.has(stepId) || closing.has(stepId),
    };
  }
  // Fallback canônico: classifica pelo TÍTULO da etapa.
  return {
    isScheduled: (_stepId, title) => title !== undefined && SCHEDULED_TITLES.has(title),
    isClosing: (_stepId, title) => title === CLOSING,
    isNoShow: (_stepId, title) => title === NOSHOW,
    isNotScheduled: (_stepId, title) => title === NOT_SCHEDULED,
    isAttended: (_stepId, title) => title !== undefined && ATTENDED_TITLES.has(title),
  };
}

export function buildLiveFunnel(
  steps: HelenaStep[],
  monthCards: HelenaCard[],
  mapping?: FunnelMapping | null,
  tagMapping?: SchedulerTagMapping | null,
) {
  const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
  const { isScheduled, isClosing, isNoShow, isNotScheduled, isAttended } =
    resolveClassifier(steps, mapping);
  const crcTags = new Set(tagMapping?.crcTagIds ?? []);
  const iaTags = new Set(tagMapping?.iaTagIds ?? []);
  const countByTitle = new Map<string, number>();
  let revenue = 0;
  let leads = 0;
  let scheduled = 0;
  let noShow = 0;
  let notScheduled = 0;
  let attended = 0;
  let closed = 0;
  let scheduledByCrc = 0;
  let scheduledByIa = 0;
  let scheduledUnclassified = 0;
  for (const card of monthCards) {
    const title = titleByStepId.get(card.stepId);
    if (!title) continue;
    leads++;
    countByTitle.set(title, (countByTitle.get(title) ?? 0) + 1);
    if (isScheduled(card.stepId, title)) {
      scheduled++;
      const isCrc = card.tagIds.some((t) => crcTags.has(t));
      const isIa = card.tagIds.some((t) => iaTags.has(t));
      if (isCrc) scheduledByCrc++;
      else if (isIa) scheduledByIa++;
      else scheduledUnclassified++;
    }
    if (isClosing(card.stepId, title)) {
      closed++;
      revenue += card.monetaryAmount ?? 0; // faturamento = valor do card
    }
    if (isNoShow(card.stepId, title)) noShow++;
    if (isNotScheduled(card.stepId, title)) notScheduled++;
    if (isAttended(card.stepId, title)) attended++;
  }
  // Com mapping, exibe as etapas reais do painel (na ordem do Kanban); sem
  // mapping, mantém as 9 etapas canônicas para compatibilidade de exibição.
  const outSteps = mapping
    ? [...steps]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ title: s.title, count: countByTitle.get(s.title) ?? 0 }))
    : CANONICAL_STEPS.map((title) => ({ title, count: countByTitle.get(title) ?? 0 }));
  const rate = leads === 0 ? 0 : scheduled / leads;
  return {
    steps: outSteps,
    leads,
    scheduled,
    rate,
    revenue,
    noShow,
    notScheduled,
    attended,
    closed,
    scheduledByCrc,
    scheduledByIa,
    scheduledUnclassified,
  };
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
  mapping?: FunnelMapping | null,
): DailyFunnelPoint[] {
  const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
  const { isScheduled } = resolveClassifier(steps, mapping);
  const byDay = new Map<string, { leads: number; scheduled: number }>();
  for (const card of monthCards) {
    const title = titleByStepId.get(card.stepId);
    if (!title) continue;
    const day = card.createdAt.slice(0, 10);
    const bucket = byDay.get(day) ?? { leads: 0, scheduled: 0 };
    bucket.leads++;
    if (isScheduled(card.stepId, title)) bucket.scheduled++;
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
