"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGestor } from "@/lib/auth/require-gestor";

// ── Types ────────────────────────────────────────────────────────────────────

/** Uma linha da view whatsapp_response_stats (por clínica + mês). */
export type ResponseStatRow = {
  clinic_id: string;
  year_month: string; // YYYY-MM (fuso America/Sao_Paulo)
  episodes: number;
  answered: number;
  unanswered: number;
  avg_seconds: number | null;
  median_seconds: number | null;
};

export type WhatsappGroupRow = {
  group_jid: string;
  name: string | null;
  clinic_id: string | null;
};

export type TeamMemberRow = {
  id: string;
  lid: string | null;
  name: string | null;
  kind: "human" | "bot";
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Configurar o WhatsApp (mapear grupos, editar equipe/bot, sincronizar) é ação
// de gestor. O desenvolvedor só visualiza (leitura via list* sem este gate).
async function requireGestorClient() {
  const gate = await requireGestor();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  return { ok: true as const, supabase: await createClient() };
}

// ── Métrica de tempo de resposta ─────────────────────────────────────────────

/** Estatísticas de todas as clínicas num mês (para o dashboard). */
export async function listResponseStats(month: string): Promise<ResponseStatRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_response_stats")
    .select("clinic_id, year_month, episodes, answered, unanswered, avg_seconds, median_seconds")
    .eq("year_month", month);
  if (error) throw new Error(error.message);
  return (data ?? []) as ResponseStatRow[];
}

/** Série mensal de uma clínica (mês mais recente primeiro). */
export async function getClinicResponseStats(clinicId: string): Promise<ResponseStatRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_response_stats")
    .select("clinic_id, year_month, episodes, answered, unanswered, avg_seconds, median_seconds")
    .eq("clinic_id", clinicId)
    .order("year_month", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResponseStatRow[];
}

// ── Resumos diários (IA) ─────────────────────────────────────────────────────

export type DailySummaryRow = {
  clinic_id: string;
  summary_date: string; // YYYY-MM-DD
  summary_md: string;
  highlights: {
    temas?: string[];
    pendencias?: string[];
    reclamacoes?: string[];
    sentimento?: "positivo" | "neutro" | "negativo";
    risco_churn?: boolean;
  } | null;
  model: string | null;
  message_count: number;
};

/** Resumos de um dia (todas as clínicas). */
export async function listDailySummaries(date: string): Promise<DailySummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_daily_summaries")
    .select("clinic_id, summary_date, summary_md, highlights, model, message_count")
    .eq("summary_date", date)
    .order("message_count", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DailySummaryRow[];
}

/** Datas (desc) que têm pelo menos um resumo — para o seletor da página. */
export async function listSummaryDates(limit = 30): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_daily_summaries")
    .select("summary_date")
    .order("summary_date", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    seen.add(row.summary_date as string);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/** Resumos de uma clínica (mais recentes primeiro) — para o dia-a-dia no perfil. */
export async function listClinicSummaries(
  clinicId: string,
  limit = 30,
): Promise<DailySummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_daily_summaries")
    .select("clinic_id, summary_date, summary_md, highlights, model, message_count")
    .eq("clinic_id", clinicId)
    .order("summary_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as DailySummaryRow[];
}

/**
 * Clínicas que pedem atenção segundo o último resumo diário (janela de `days`):
 * sentimento negativo, risco de churn ou reclamações. Considera apenas o resumo
 * mais recente de cada clínica, para o card "Atenção · Resumos IA" do dashboard.
 */
export async function listAttentionSummaries(days = 7): Promise<DailySummaryRow[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("whatsapp_daily_summaries")
    .select("clinic_id, summary_date, summary_md, highlights, model, message_count")
    .gte("summary_date", since)
    .order("summary_date", { ascending: false });
  if (error) throw new Error(error.message);

  const latestByClinic = new Map<string, DailySummaryRow>();
  for (const row of (data ?? []) as DailySummaryRow[]) {
    if (!latestByClinic.has(row.clinic_id)) latestByClinic.set(row.clinic_id, row);
  }
  return [...latestByClinic.values()]
    .filter(
      (s) =>
        s.highlights?.risco_churn ||
        s.highlights?.sentimento === "negativo" ||
        (s.highlights?.reclamacoes?.length ?? 0) > 0,
    )
    .sort((a, b) => {
      // risco de churn primeiro, depois mais recente
      const churn = Number(b.highlights?.risco_churn ?? false) - Number(a.highlights?.risco_churn ?? false);
      if (churn !== 0) return churn;
      return b.summary_date.localeCompare(a.summary_date);
    });
}

/** Timestamp da última mensagem coletada (proxy do status do cron). */
export async function getLastCollectedAt(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_group_messages")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.created_at as string | undefined) ?? null;
}

// ── Health check da conexão Evolution ────────────────────────────────────────

export type EvolutionHealth = {
  checked_at: string;
  state: string | null;
  ok: boolean;
  /** desde quando está fora do ar (primeiro check ruim da sequência atual) */
  down_since: string | null;
};

/**
 * Último health check de um canal + início da indisponibilidade atual.
 *
 * 'leitura' = instância que coleta os grupos; 'envio' = a que manda os
 * relatórios. São instâncias distintas nos secrets e falham separado — o
 * histórico anterior à 0068 é todo de leitura (default da coluna).
 */
export async function getEvolutionHealth(
  channel: "leitura" | "envio" = "leitura",
): Promise<EvolutionHealth | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evolution_health_checks")
    .select("checked_at, state, ok")
    .eq("channel", channel)
    .order("checked_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const checks = (data ?? []) as { checked_at: string; state: string | null; ok: boolean }[];
  if (checks.length === 0) return null;

  const latest = checks[0];
  let downSince: string | null = null;
  if (!latest.ok) {
    downSince = latest.checked_at;
    for (const c of checks.slice(1)) {
      if (c.ok) break;
      downSince = c.checked_at;
    }
  }
  return { ...latest, down_since: downSince };
}

// ── Entregas dos relatórios ao grupo ─────────────────────────────────────────

export type NotifyDelivery = {
  type: string;
  ok: boolean;
  recipients: number;
  error: string | null;
  created_at: string;
};

export type NotifyDeliveryStatus = {
  /** Última entrega em que TODOS os destinatários receberam. */
  lastOk: NotifyDelivery | null;
  /** Última tentativa, dando certo ou não. */
  lastAttempt: NotifyDelivery | null;
  /** Sem entrega boa há mais de 26h (o ciclo é diário: 9h e 19h BRT). */
  stale: boolean;
  /** Últimas tentativas, para a faixa de histórico. */
  recent: NotifyDelivery[];
};

/**
 * Estado do envio dos relatórios ao grupo (notify_deliveries, 0068).
 *
 * A instância pode estar "open" e mesmo assim nada chegar — destinatário
 * errado, bot removido do grupo. Só o histórico de entregas mostra isso.
 */
export async function getNotifyDeliveryStatus(): Promise<NotifyDeliveryStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notify_deliveries")
    .select("type, ok, recipients, error, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NotifyDelivery[];

  const lastAttempt = rows[0] ?? null;
  const lastOk = rows.find((r) => r.ok) ?? null;
  // Tabela vazia não é falha: é projeto sem histórico ainda.
  const stale =
    lastAttempt != null &&
    (lastOk == null || Date.now() - new Date(lastOk.created_at).getTime() > 26 * 3600_000);

  return { lastOk, lastAttempt, stale, recent: rows.slice(0, 8) };
}

// ── Grupos ───────────────────────────────────────────────────────────────────

export async function listWhatsappGroups(): Promise<WhatsappGroupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("group_jid, name, clinic_id")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as WhatsappGroupRow[];
}

/**
 * Roda a coleta da Evolution (`collect-groups`) na hora, em vez de esperar o
 * cron das 18h — para quando entra uma clínica nova e o grupo dela ainda não
 * apareceu na lista de mapeamento. Reusa a mesma Edge Function do cron diário,
 * só que on-demand; lookback curto (24h) então é rápido mesmo com muitos grupos.
 */
export async function syncWhatsappGroups(): Promise<
  | { ok: true; groupsFetched: number; messagesInserted: number }
  | { ok: false; error: string }
> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!baseUrl || !secret) {
    return {
      ok: false,
      error: "Sincronização não configurada — falta COLLECT_GROUPS_CRON_SECRET no ambiente.",
    };
  }

  let data: { ok?: boolean; error?: string; groupsFetched?: number; inserted?: number } | null = null;
  try {
    const res = await fetch(`${baseUrl}/functions/v1/collect-groups?lookbackHours=24`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? `Falha na sincronização (HTTP ${res.status})` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao contatar a função de coleta" };
  }

  revalidatePath("/configuracoes/whatsapp");
  revalidatePath("/whatsapp");
  return { ok: true, groupsFetched: data.groupsFetched ?? 0, messagesInserted: data.inserted ?? 0 };
}

/** Mapeia (ou desmapeia, clinicId=null) um grupo para uma clínica. */
export async function updateGroupClinic(
  groupJid: string,
  clinicId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;
  const supabase = gate.supabase;

  const { error } = await supabase
    .from("whatsapp_groups")
    .update({ clinic_id: clinicId, updated_at: new Date().toISOString() })
    .eq("group_jid", groupJid);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes/whatsapp");
  revalidatePath("/");
  return { ok: true };
}

// ── Equipe (identidades @lid) ────────────────────────────────────────────────

export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_team_members")
    .select("id, lid, name, kind")
    .order("kind")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamMemberRow[];
}

export async function addTeamMember(member: {
  lid: string;
  name: string;
  kind: "human" | "bot";
}): Promise<{ ok: true; member: TeamMemberRow } | { ok: false; error: string }> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;
  const supabase = gate.supabase;

  const lid = member.lid.replace(/\D/g, "");
  if (lid.length < 8) return { ok: false, error: "ID (@lid) inválido — só dígitos, mínimo 8" };
  const name = member.name.trim();
  if (name.length < 2) return { ok: false, error: "Nome muito curto" };

  const { data, error } = await supabase
    .from("whatsapp_team_members")
    .insert({ lid, name, kind: member.kind })
    .select("id, lid, name, kind")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes/whatsapp");
  return { ok: true, member: data as TeamMemberRow };
}

export async function deleteTeamMember(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;
  const supabase = gate.supabase;

  const { error } = await supabase.from("whatsapp_team_members").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}
