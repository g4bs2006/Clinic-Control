// Preços por 1M tokens (USD) — conferir na página oficial de cada provedor e
// atualizar aqui quando mudar. Usamos o preço de "cache miss" (o mais caro) do
// input como estimativa conservadora, já que não distinguimos hit/miss.
export type AiProvider = "deepseek" | "openai";

const PRICE_PER_1M_USD: Record<AiProvider, { input: number; output: number }> = {
  deepseek: { input: 0.14, output: 0.28 }, // deepseek-chat, conferido em api-docs.deepseek.com/quick_start/pricing (2026-07)
  openai: { input: 0.15, output: 0.6 }, // placeholder — ainda não usado em produção
};

// Câmbio fixo, ajuste manual — não há necessidade de cotação em tempo real
// para uma estimativa de custo mensal.
export const USD_TO_BRL = 5.5;

export function estimateCostUsd(
  provider: AiProvider,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = PRICE_PER_1M_USD[provider] ?? PRICE_PER_1M_USD.deepseek;
  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}

export function estimateCostBrl(provider: AiProvider, promptTokens: number, completionTokens: number): number {
  return estimateCostUsd(provider, promptTokens, completionTokens) * USD_TO_BRL;
}

export function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PURPOSE_LABEL: Record<string, string> = {
  resumo_diario: "Resumos diários",
  subtarefas_ia: "Subtarefas via IA",
  deteccao_padroes: "Detecção de padrões",
};

export function purposeLabel(purpose: string): string {
  return PURPOSE_LABEL[purpose] ?? purpose;
}
