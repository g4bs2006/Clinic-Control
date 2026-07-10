// Matemática pura das tarefas recorrentes — testável no vitest, sem I/O.
// Datas em YYYY-MM-DD (fuso operacional America/Sao_Paulo resolvido no chamador).

export type RecurrenceFreq = "diaria" | "semanal" | "mensal";

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  /** 0=domingo … 6=sábado (para semanal). */
  weekday: number | null;
  /** 1..31 (para mensal; ajusta para o último dia em meses curtos). */
  monthday: number | null;
};

const DAY_MS = 86_400_000;

function toUtcDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(y: number, m1to12: number): number {
  return new Date(Date.UTC(y, m1to12, 0)).getUTCDate();
}

/**
 * Data devida mais recente da regra que seja ≤ hoje (a "última ocorrência de
 * calendário"). É o que o materializador tenta criar — com anti-empilhamento,
 * ocorrências perdidas no meio NÃO são retroagidas (não empilha atraso).
 * Retorna null apenas para regra malformada.
 */
export function lastDue(rule: RecurrenceRule, today: string): string | null {
  const t = toUtcDate(today);

  if (rule.freq === "diaria") return today;

  if (rule.freq === "semanal") {
    if (rule.weekday === null || rule.weekday < 0 || rule.weekday > 6) return null;
    const diff = (t.getUTCDay() - rule.weekday + 7) % 7;
    return fromUtcDate(new Date(t.getTime() - diff * DAY_MS));
  }

  // mensal
  if (rule.monthday === null || rule.monthday < 1 || rule.monthday > 31) return null;
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + 1;
  const dueThisMonth = Math.min(rule.monthday, daysInMonth(y, m));
  if (t.getUTCDate() >= dueThisMonth) {
    return fromUtcDate(new Date(Date.UTC(y, m - 1, dueThisMonth)));
  }
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const duePrev = Math.min(rule.monthday, daysInMonth(prevY, prevM));
  return fromUtcDate(new Date(Date.UTC(prevY, prevM - 1, duePrev)));
}

/** Rótulo humano da frequência da regra (UI). */
export function freqLabel(rule: RecurrenceRule): string {
  if (rule.freq === "diaria") return "Diária";
  if (rule.freq === "semanal") {
    const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    return `Semanal · ${dias[rule.weekday ?? 1]}`;
  }
  return `Mensal · dia ${rule.monthday ?? 1}`;
}
