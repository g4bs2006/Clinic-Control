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
