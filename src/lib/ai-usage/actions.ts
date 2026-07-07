"use server";

import { createClient } from "@/lib/supabase/server";
import { estimateCostBrl, type AiProvider } from "./pricing";

export type AiUsageStats = {
  yearMonth: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostBrl: number;
  byPurpose: {
    purpose: string;
    promptTokens: number;
    completionTokens: number;
    costBrl: number;
  }[];
};

/** Uso de tokens de IA (todos os usos: resumos, subtarefas etc.) num mês. */
export async function getAiUsageStats(yearMonth?: string): Promise<AiUsageStats> {
  const supabase = await createClient();
  const ym = yearMonth ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("provider, purpose, prompt_tokens, completion_tokens")
    .gte("created_at", `${start}T00:00:00-03:00`)
    .lt("created_at", `${nextMonthStart}T00:00:00-03:00`);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    provider: AiProvider;
    purpose: string;
    prompt_tokens: number;
    completion_tokens: number;
  }[];

  const byPurposeMap = new Map<string, { promptTokens: number; completionTokens: number; costBrl: number }>();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostBrl = 0;

  for (const r of rows) {
    const cost = estimateCostBrl(r.provider, r.prompt_tokens, r.completion_tokens);
    totalPromptTokens += r.prompt_tokens;
    totalCompletionTokens += r.completion_tokens;
    totalCostBrl += cost;

    const entry = byPurposeMap.get(r.purpose) ?? { promptTokens: 0, completionTokens: 0, costBrl: 0 };
    entry.promptTokens += r.prompt_tokens;
    entry.completionTokens += r.completion_tokens;
    entry.costBrl += cost;
    byPurposeMap.set(r.purpose, entry);
  }

  return {
    yearMonth: ym,
    totalPromptTokens,
    totalCompletionTokens,
    totalCostBrl,
    byPurpose: [...byPurposeMap.entries()]
      .map(([purpose, v]) => ({ purpose, ...v }))
      .sort((a, b) => b.costBrl - a.costBrl),
  };
}
