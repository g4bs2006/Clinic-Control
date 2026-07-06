export type StatusRule = { label: string; rate_min: number; rate_max: number; color: string };

export function resolveStatus(args: {
  rate: number;
  override?: string | null;
  rules: StatusRule[];
}): { label: string; color: string } | null {
  const { rate, override, rules } = args;
  if (override) {
    const match = rules.find((r) => r.label === override);
    return { label: override, color: match?.color ?? "#9ca3af" };
  }
  const rule = rules.find((r) => rate >= r.rate_min && rate < r.rate_max);
  return rule ? { label: rule.label, color: rule.color } : null;
}

/**
 * resolveStatus escolhe a primeira faixa (por position) que contém a taxa;
 * uma faixa nova que se sobrepõe a uma existente nunca seria escolhida.
 * Por isso as faixas precisam ser disjuntas — este helper acha o conflito.
 */
export function findOverlappingRule<T extends { id?: string; label: string; rate_min: number; rate_max: number }>(
  candidate: { id?: string; rate_min: number; rate_max: number },
  rules: T[],
): T | null {
  return (
    rules.find(
      (r) =>
        (r.id === undefined || r.id !== candidate.id) &&
        candidate.rate_min < Number(r.rate_max) &&
        Number(r.rate_min) < candidate.rate_max,
    ) ?? null
  );
}
