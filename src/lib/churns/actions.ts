"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChurnRow = {
  id: string;
  clinic_id: string;
  clinic_name: string;
  /**
   * Dev dono da clínica. Vem no registro porque o recorte de carteira NÃO pode
   * ser feito contra listClinics(): ela exclui arquivadas, e toda clínica com
   * churn é arquivada pelo próprio registerChurn — o filtro zerava a lista.
   */
  clinic_developer_id: string | null;
  churn_month: string; // YYYY-MM
  reason: string | null;
  notes: string | null;
  lost_revenue: number | null;
  created_at: string;
};

export type ChurnAnalysisReason = { motivo?: string; confianca?: string; evidencia?: string };
export type ChurnAnalysisSignal = { quando?: string; sinal?: string };

export type ChurnAnalysis = {
  churn_id: string;
  status: "rodando" | "concluido" | "erro";
  summary: string | null;
  reasons: ChurnAnalysisReason[];
  signals: ChurnAnalysisSignal[];
  quotes: string[];
  messages_used: number;
  truncated: boolean;
  window_days: number;
  model: string | null;
  error: string | null;
  updated_at: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

/**
 * Dispara o post-mortem na Edge Function churn-postmortem.
 *
 * A análise mora lá porque a chave do LLM só existe nos secrets do Supabase.
 * A linha de churn_analyses é criada AQUI, antes do fetch: assim a tabela já
 * mostra "analisando…" e, se a chamada se perder, sobra o registro para o botão
 * "Analisar de novo" retomar em vez de um churn silenciosamente sem análise.
 */
async function triggerPostmortem(churnId: string, clinicId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = (process.env.COLLECT_GROUPS_CRON_SECRET ?? "").trim();
  if (!baseUrl || !secret) return;

  const supabase = await createClient();
  await supabase
    .from("churn_analyses")
    .upsert(
      { churn_id: churnId, clinic_id: clinicId, status: "rodando", error: null },
      { onConflict: "churn_id" },
    );

  // Depois da resposta: a análise leva dezenas de segundos e não pode segurar
  // o formulário. Se o runtime encerrar antes, o status fica em 'rodando' e o
  // botão manual recupera.
  after(async () => {
    try {
      await fetch(`${baseUrl}/functions/v1/churn-postmortem`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({ churnId }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      /* status segue 'rodando'; o botão "Analisar de novo" refaz */
    }
  });
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function listChurns(): Promise<ChurnRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_churns")
    .select(
      "id, clinic_id, churn_month, reason, notes, lost_revenue, created_at, clinics(name, developer_id)",
    )
    .order("churn_month", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  type JoinedClinic = { name: string; developer_id: string | null };
  return (data ?? []).map((row) => {
    const clinics = row.clinics as JoinedClinic | JoinedClinic[] | null;
    const clinic = Array.isArray(clinics) ? clinics[0] : clinics;
    return {
      id: row.id as string,
      clinic_id: row.clinic_id as string,
      clinic_name: clinic?.name ?? "—",
      clinic_developer_id: clinic?.developer_id ?? null,
      churn_month: row.churn_month as string,
      reason: row.reason as string | null,
      notes: row.notes as string | null,
      lost_revenue: row.lost_revenue as number | null,
      created_at: row.created_at as string,
    };
  });
}

/** Registra o churn e arquiva a clínica (sai da carteira ativa). */
export async function registerChurn(input: {
  clinicId: string;
  churnMonth: string;
  reason: string;
  notes?: string;
  lostRevenue?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  if (!/^\d{4}-\d{2}$/.test(input.churnMonth)) {
    return { ok: false, error: "Mês inválido (use AAAA-MM)" };
  }

  const { data: inserted, error } = await supabase
    .from("clinic_churns")
    .insert({
      clinic_id: input.clinicId,
      churn_month: input.churnMonth,
      reason: input.reason || null,
      notes: input.notes?.trim() || null,
      lost_revenue: input.lostRevenue ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: archiveError } = await supabase
    .from("clinics")
    .update({ contract_status: "archived" })
    .eq("id", input.clinicId);
  if (archiveError) return { ok: false, error: archiveError.message };

  // Post-mortem automático: enquanto o motivo registrado é um item de lista
  // fechada, a conversa do grupo costuma ter a história real.
  if (inserted?.id) await triggerPostmortem(inserted.id as string, input.clinicId);

  revalidatePath("/churns");
  revalidatePath("/");
  revalidatePath("/clinicas");
  return { ok: true };
}

/** Análises por churn_id — a tabela lê tudo de uma vez, sem N+1. */
export async function listChurnAnalyses(): Promise<Record<string, ChurnAnalysis>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("churn_analyses")
    .select(
      "churn_id, status, summary, reasons, signals, quotes, messages_used, truncated, window_days, model, error, updated_at",
    );
  if (error) throw new Error(error.message);
  const out: Record<string, ChurnAnalysis> = {};
  for (const row of data ?? []) out[row.churn_id as string] = row as ChurnAnalysis;
  return out;
}

/** Reprocessa (ou gera pela primeira vez) a análise de um churn já registrado. */
export async function requestChurnAnalysis(
  churnId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { data: churn, error } = await supabase
    .from("clinic_churns")
    .select("clinic_id")
    .eq("id", churnId)
    .single();
  if (error) return { ok: false, error: error.message };

  await triggerPostmortem(churnId, churn.clinic_id as string);
  revalidatePath("/churns");
  return { ok: true };
}

/** Remove o registro; opcionalmente reativa a clínica na carteira. */
export async function removeChurn(
  id: string,
  reactivateClinic: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { data: churn, error: fetchError } = await supabase
    .from("clinic_churns")
    .select("clinic_id")
    .eq("id", id)
    .single();
  if (fetchError) return { ok: false, error: fetchError.message };

  const { error } = await supabase.from("clinic_churns").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (reactivateClinic && churn) {
    const { error: reactivateError } = await supabase
      .from("clinics")
      .update({ contract_status: "active" })
      .eq("id", churn.clinic_id);
    if (reactivateError) return { ok: false, error: reactivateError.message };
  }

  revalidatePath("/churns");
  revalidatePath("/");
  revalidatePath("/clinicas");
  return { ok: true };
}
