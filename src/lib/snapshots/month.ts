// Primeiro mês com métricas na carteira. Gráficos e seletores de mês não
// devem ir antes disto (evita meses vazios pré-maio/2026).
export const DATA_START_MONTH = "2026-05";

export function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return monthKey(d);
}

export function isPastMonth(key: string, now: Date): boolean {
  return key < monthKey(now);
}

export function monthRangeUtc(key: string): { after: string; before: string } {
  const [y, m] = key.split("-").map(Number);
  const after = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const before = new Date(Date.UTC(y, m, 1)).toISOString();
  return { after, before };
}
