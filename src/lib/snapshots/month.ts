// Primeiro mês com métricas na carteira. Gráficos e seletores de mês não
// devem ir antes disto (evita meses vazios pré-maio/2026).
export const DATA_START_MONTH = "2026-05";

// Fuso do negócio: America/Sao_Paulo é -03:00 FIXO desde 2019 (sem horário de
// verão), então um deslocamento constante é exato. O "mês" das métricas vira à
// meia-noite BRT, não UTC — casa com o painel da Helena filtrado em horário
// local (antes, leads de 21h-24h do último dia caíam no mês seguinte).
export const BRT_OFFSET_HOURS = 3;

export function monthKey(date: Date): string {
  const shifted = new Date(date.getTime() - BRT_OFFSET_HOURS * 3_600_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isPastMonth(key: string, now: Date): boolean {
  return key < monthKey(now);
}

/** Janela do mês em BRT, expressa em UTC (00:00 BRT = 03:00 UTC). */
export function monthRangeBrt(key: string): { after: string; before: string } {
  const [y, m] = key.split("-").map(Number);
  const after = new Date(Date.UTC(y, m - 1, 1, BRT_OFFSET_HOURS)).toISOString();
  const before = new Date(Date.UTC(y, m, 1, BRT_OFFSET_HOURS)).toISOString();
  return { after, before };
}
