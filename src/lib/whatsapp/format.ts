// Formatação de durações do tempo de resposta (segundos → texto pt-BR curto).

/** "45s", "12 min", "3h 20min", "2d 5h" */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  if (hours < 24) return restMin > 0 ? `${hours}h ${restMin}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return restH > 0 ? `${days}d ${restH}h` : `${days}d`;
}
