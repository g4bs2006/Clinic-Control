// Lógica pura da agenda "Minha semana" — classifica tarefas por proximidade de
// prazo. Sem I/O; a data "agora" é passada de fora para ser testável.

export type AgendaBucket = "atrasada" | "hoje" | "semana" | "depois" | "sem_prazo";

export const AGENDA_ORDER: AgendaBucket[] = [
  "atrasada",
  "hoje",
  "semana",
  "depois",
  "sem_prazo",
];

export const AGENDA_LABEL: Record<AgendaBucket, string> = {
  atrasada: "Atrasadas",
  hoje: "Hoje",
  semana: "Esta semana",
  depois: "Mais tarde",
  sem_prazo: "Sem prazo",
};

/**
 * Classifica um `due_date` (YYYY-MM-DD ou null) em um grupo da agenda, comparando
 * com `today` e `endOfWeek` (ambos YYYY-MM-DD). Comparação lexicográfica de
 * strings ISO funciona como comparação de datas.
 */
export function agendaBucket(
  dueDate: string | null,
  today: string,
  endOfWeek: string,
): AgendaBucket {
  if (!dueDate) return "sem_prazo";
  if (dueDate < today) return "atrasada";
  if (dueDate === today) return "hoje";
  if (dueDate <= endOfWeek) return "semana";
  return "depois";
}

/** YYYY-MM-DD de uma data no fuso America/Sao_Paulo. */
function saoPauloDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * "Hoje" e o fim da semana (próximo domingo) no fuso America/Sao_Paulo, ambos
 * YYYY-MM-DD. Recebe `now` para ser determinístico nos testes. Se hoje já for
 * domingo, `endOfWeek === today`.
 */
export function spDateParts(now: Date): { today: string; endOfWeek: string } {
  const today = saoPauloDate(now);
  // Ancora ao meio-dia UTC para não escorregar de dia ao somar; o dia da semana
  // é derivado da própria string de data (independe de fuso a partir daqui).
  const base = new Date(`${today}T12:00:00Z`);
  const dow = base.getUTCDay(); // 0 = domingo … 6 = sábado
  const daysToSunday = (7 - dow) % 7;
  base.setUTCDate(base.getUTCDate() + daysToSunday);
  const endOfWeek = base.toISOString().slice(0, 10);
  return { today, endOfWeek };
}
