/**
 * Pure derived metrics computed from canonical Helena funnel step counts.
 * All ratios return 0 when the denominator is 0.
 */

export function derivedMetrics(stepCounts: Record<string, number>): {
  attendance: number;
  closing: number;
  noShow: number;
} {
  const get = (key: string) => stepCounts[key] ?? 0;

  const agendados = get("Agendados");
  const faltosos = get("Faltosos");
  const comparecNao = get("Compareceram e Não Fecharam");
  const comparecSim = get("Compareceram e Fecharam");

  const attendanceDenom = agendados;
  const attendance = attendanceDenom === 0 ? 0 : (comparecNao + comparecSim) / attendanceDenom;

  const closingDenom = comparecNao + comparecSim;
  const closing = closingDenom === 0 ? 0 : comparecSim / closingDenom;

  const noShowDenom = agendados;
  const noShow = noShowDenom === 0 ? 0 : faltosos / noShowDenom;

  return { attendance, closing, noShow };
}
