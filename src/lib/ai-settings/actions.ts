"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/users/actions";

export type AiSettings = {
  summary_instructions: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
};

export async function getAiSettings(): Promise<AiSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_settings")
    .select("summary_instructions, model, temperature, max_tokens")
    .eq("id", true)
    .maybeSingle();
  return {
    summary_instructions: (data?.summary_instructions as string) ?? "",
    model: (data?.model as string | null) ?? null,
    temperature: data?.temperature != null ? Number(data.temperature) : null,
    max_tokens: (data?.max_tokens as number | null) ?? null,
  };
}

export async function updateAiSettings(input: {
  summary_instructions: string;
  model: string;
  temperature: number;
  max_tokens: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (profile?.role !== "gestor") return { ok: false, error: "Apenas gestores podem alterar" };

  const instructions = input.summary_instructions.trim();
  if (instructions.length < 20) return { ok: false, error: "As instruções estão curtas demais" };
  if (!(input.temperature >= 0 && input.temperature <= 2)) {
    return { ok: false, error: "Temperatura deve ficar entre 0 e 2" };
  }
  if (!(input.max_tokens >= 200 && input.max_tokens <= 8000)) {
    return { ok: false, error: "max_tokens deve ficar entre 200 e 8000" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_settings")
    .update({
      summary_instructions: instructions,
      model: input.model.trim() || null,
      temperature: input.temperature,
      max_tokens: Math.round(input.max_tokens),
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes/ia");
  return { ok: true };
}

// ── Qualidade das sugestões (aceite vs descarte) ─────────────────────────────

export type SuggestionStats = {
  accepted: number;
  dismissed: number;
  pending: number;
  acceptRate: number | null; // aceitas / (aceitas + descartadas)
};

export async function getSuggestionStats(): Promise<SuggestionStats> {
  const supabase = await createClient();
  const countBy = async (status: string) => {
    const { count } = await supabase
      .from("task_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count ?? 0;
  };
  const [accepted, dismissed, pending] = await Promise.all([
    countBy("accepted"),
    countBy("dismissed"),
    countBy("pending"),
  ]);
  const reviewed = accepted + dismissed;
  return {
    accepted,
    dismissed,
    pending,
    acceptRate: reviewed > 0 ? accepted / reviewed : null,
  };
}

// ── Playground: pré-visualiza o resumo de 1 clínica/dia (sem gravar) ─────────

export type PreviewResult =
  | {
      ok: true;
      model: string;
      resumo_md: string | null;
      highlights: {
        tarefas?: { acao: string; motivo: string | null; tipo: "acao" | "acompanhamento" }[];
        pendencias?: string[];
        reclamacoes?: string[];
        severidade?: string;
      } | null;
    }
  | { ok: false; error: string };

export async function previewSummary(clinicId: string, date: string): Promise<PreviewResult> {
  const profile = await getCurrentProfile();
  if (profile?.role !== "gestor") return { ok: false, error: "Apenas gestores podem testar" };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!base || !secret) {
    return { ok: false, error: "Config ausente (NEXT_PUBLIC_SUPABASE_URL / COLLECT_GROUPS_CRON_SECRET)" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Data inválida (use AAAA-MM-DD)" };

  const url = `${base}/functions/v1/summarize-groups?preview=1&clinic=${encodeURIComponent(clinicId)}&date=${date}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": secret, "content-type": "application/json" },
      body: "{}",
    });
    const json = await res.json();
    if (!res.ok || json?.ok === false) {
      return { ok: false, error: json?.error ?? `Falha (${res.status})` };
    }
    return {
      ok: true,
      model: json.model,
      resumo_md: json.resumo_md ?? null,
      highlights: json.highlights ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao chamar a IA" };
  }
}
