"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getSessionUser } from "@/lib/auth/session";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import {
  listPanels,
  getPanelWithSteps,
  listCards,
  getContactCount,
  getChatCounts,
  getSessionTakeoverStats,
  getCompanyInfo,
  listDepartments,
  listUsers,
  listChannels,
} from "@/lib/helena/client";
import { buildLiveFunnel, buildDailyFunnel, type DailyFunnelPoint, type FunnelMapping } from "@/lib/helena/funnel";
import { monthKey, monthRangeUtc } from "@/lib/snapshots/month";

// Converte as colunas de mapeamento da linha de clinic_integrations no
// FunnelMapping consumido pela lógica pura. NULL nas duas colunas-chave
// (scheduled/closing) = clínica nunca configurada → retorna null e a lógica
// cai no fallback canônico por título. Um array vazio é config explícita.
function rowToMapping(row: {
  lead_step_ids?: string[] | null;
  scheduled_step_ids?: string[] | null;
  closing_step_ids?: string[] | null;
  noshow_step_ids?: string[] | null;
  notscheduled_step_ids?: string[] | null;
}): FunnelMapping | null {
  const scheduled = row.scheduled_step_ids ?? null;
  const closing = row.closing_step_ids ?? null;
  if (scheduled === null && closing === null) return null;
  return {
    scheduledStepIds: scheduled ?? [],
    closingStepIds: closing ?? [],
    noshowStepIds: row.noshow_step_ids ?? [],
    notScheduledStepIds: row.notscheduled_step_ids ?? [],
    leadStepIds: row.lead_step_ids ?? [],
  };
}

// Auth design note: these actions gate on "is there an authenticated user?" only.
// They do NOT check per-clinic membership/ownership because the app model treats every
// authenticated user as trusted internal staff with full access to all clinics — the same
// policy used by Phase 1 RLS (authenticated role = full access). A per-clinic gate here
// would be inconsistent with that model and is intentionally omitted.

export async function listPanelsForToken(token: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };
    const panels = await listPanels(token);
    return { ok: true as const, panels };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar painéis" };
  }
}

export async function getHelenaSetupOverview(token: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const [panels, contactCount, channels] = await Promise.all([
      listPanels(token).catch(() => []),
      getContactCount(token).catch(() => 0),
      listChannels(token).catch(() => []),
    ]);

    let company = null;
    if (panels.length > 0 && panels[0].companyId) {
      company = await getCompanyInfo(token, panels[0].companyId).catch(() => null);
    }

    return {
      ok: true as const,
      panels,
      contactCount,
      channels,
      company,
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao obter visão geral do setup" };
  }
}

export async function saveIntegration(clinicId: string, token: string, panelId: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };
    const { panel } = await getPanelWithSteps(token, panelId); // valida token + obtém companyId
    const supabase = createServiceClient();
    const { error } = await supabase.from("clinic_integrations").upsert({
      clinic_id: clinicId,
      helena_token_encrypted: encryptToken(token),
      panel_id: panelId,
      company_id: panel.companyId,
      last_sync_at: new Date().toISOString(),
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao salvar integração" };
  }
}

export async function getFunnelForMonth(clinicId: string, yearMonth: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id, lead_step_ids, scheduled_step_ids, closing_step_ids, noshow_step_ids, notscheduled_step_ids")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    if (!data.panel_id)
      return { ok: false as const, error: "Painel ainda não vinculado — crie na Helena e reprocesse" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const panelId = data.panel_id as string;
    const { steps } = await getPanelWithSteps(token, panelId);
    const cards = await listCards(token, panelId, monthRangeUtc(yearMonth));
    return { ok: true as const, funnel: buildLiveFunnel(steps, cards, rowToMapping(data)) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler o funil" };
  }
}

export async function getLiveFunnel(clinicId: string) {
  return getFunnelForMonth(clinicId, monthKey(new Date()));
}

/**
 * Taxa de agendamento dia a dia, dentro do mês informado — bucketiza os
 * mesmos cards do CRM usados no funil mensal, sem novo dado persistido.
 */
export async function getDailyFunnelForMonth(
  clinicId: string,
  yearMonth: string,
): Promise<{ ok: true; days: DailyFunnelPoint[] } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id, lead_step_ids, scheduled_step_ids, closing_step_ids, noshow_step_ids, notscheduled_step_ids")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    if (!data.panel_id)
      return { ok: false as const, error: "Painel ainda não vinculado — crie na Helena e reprocesse" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const panelId = data.panel_id as string;
    const { steps } = await getPanelWithSteps(token, panelId);
    const cards = await listCards(token, panelId, monthRangeUtc(yearMonth));
    return {
      ok: true as const,
      days: buildDailyFunnel(steps, cards, yearMonth, new Date(), rowToMapping(data)),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler o funil diário" };
  }
}

// ── Configuração do mapeamento de colunas do funil ──────────────────────────

export type FunnelStepOption = { id: string; title: string; position: number; cardCount: number };
export type FunnelMappingSetup = {
  steps: FunnelStepOption[];
  leadStepIds: string[];
  scheduledStepIds: string[];
  closingStepIds: string[];
  noshowStepIds: string[];
  notScheduledStepIds: string[];
};

// Títulos usados como default quando a clínica ainda não tem mapeamento salvo,
// espelhando a classificação canônica (fallback) para que a UI já venha
// pré-marcada de forma sensata em painéis canônicos.
const DEFAULT_LEAD_TITLES = new Set(["Leads"]);
const DEFAULT_SCHEDULED_TITLES = new Set([
  "Agendados", "Reagendados", "Faltosos",
  "Compareceram e Não Fecharam", "Orçamento em Aberto", "Compareceram e Fecharam",
]);
const DEFAULT_CLOSING_TITLES = new Set(["Compareceram e Fecharam"]);
const DEFAULT_NOSHOW_TITLES = new Set(["Faltosos"]);
const DEFAULT_NOTSCHEDULED_TITLES = new Set(["Não Agendados"]);

/**
 * Carrega as etapas do painel vinculado + o mapeamento salvo, para a tela de
 * configuração das colunas. Se a clínica ainda não tem mapeamento, pré-preenche
 * a partir dos títulos canônicos (quando existirem no painel).
 */
export async function getFunnelMappingSetup(
  clinicId: string,
): Promise<{ ok: true; setup: FunnelMappingSetup } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id, lead_step_ids, scheduled_step_ids, closing_step_ids, noshow_step_ids, notscheduled_step_ids")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    if (!data.panel_id)
      return { ok: false as const, error: "Painel ainda não vinculado — crie na Helena e reprocesse" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const { steps } = await getPanelWithSteps(token, data.panel_id as string);
    const options: FunnelStepOption[] = steps.map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      cardCount: s.cardCount,
    }));

    const saved = rowToMapping(data);
    const setup: FunnelMappingSetup = saved
      ? {
          steps: options,
          leadStepIds: saved.leadStepIds ?? [],
          scheduledStepIds: saved.scheduledStepIds,
          closingStepIds: saved.closingStepIds ?? [],
          noshowStepIds: saved.noshowStepIds ?? [],
          notScheduledStepIds: saved.notScheduledStepIds ?? [],
        }
      : {
          steps: options,
          leadStepIds: options.filter((s) => DEFAULT_LEAD_TITLES.has(s.title)).map((s) => s.id),
          scheduledStepIds: options.filter((s) => DEFAULT_SCHEDULED_TITLES.has(s.title)).map((s) => s.id),
          closingStepIds: options.filter((s) => DEFAULT_CLOSING_TITLES.has(s.title)).map((s) => s.id),
          noshowStepIds: options.filter((s) => DEFAULT_NOSHOW_TITLES.has(s.title)).map((s) => s.id),
          notScheduledStepIds: options.filter((s) => DEFAULT_NOTSCHEDULED_TITLES.has(s.title)).map((s) => s.id),
        };

    return { ok: true as const, setup };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao carregar colunas do painel" };
  }
}

/** Persiste o mapeamento de colunas escolhido pelo gestor para a clínica. */
export async function saveFunnelMapping(
  clinicId: string,
  mapping: {
    leadStepIds: string[];
    scheduledStepIds: string[];
    closingStepIds: string[];
    noshowStepIds: string[];
    notScheduledStepIds: string[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("clinic_integrations")
      .select("clinic_id")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!existing)
      return { ok: false as const, error: "Integração não encontrada — salve a integração Helena primeiro" };

    const { error } = await supabase
      .from("clinic_integrations")
      .update({
        lead_step_ids: mapping.leadStepIds,
        scheduled_step_ids: mapping.scheduledStepIds,
        closing_step_ids: mapping.closingStepIds,
        noshow_step_ids: mapping.noshowStepIds,
        notscheduled_step_ids: mapping.notScheduledStepIds,
      })
      .eq("clinic_id", clinicId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao salvar mapeamento de colunas" };
  }
}

export type ClinicLead = { name: string; step: string; date: string };

// Lista os leads (cards) do mês corrente de uma clínica auto, mapeando cada
// card para a etapa atual. Reusa o gate de auth + service client das demais
// actions de integração. Tolera clínica sem integração (retorna ok:false).
export async function listClinicLeads(
  clinicId: string,
): Promise<{ ok: true; leads: ClinicLead[] } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    if (!data.panel_id)
      return { ok: false as const, error: "Painel ainda não vinculado — crie na Helena e reprocesse" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const panelId = data.panel_id as string;
    const { steps } = await getPanelWithSteps(token, panelId);
    const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
    const cards = await listCards(token, panelId, monthRangeUtc(monthKey(new Date())));

    const leads: ClinicLead[] = cards
      .map((c) => ({
        name: c.title,
        step: titleByStepId.get(c.stepId) ?? "—",
        date: c.createdAt,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // mais recentes primeiro

    return { ok: true as const, leads };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar leads" };
  }
}

type AccountOverviewResult =
  | {
      ok: true;
      contactCount: number;
      channels: import("@/lib/helena/types").HelenaChannel[];
      company: import("@/lib/helena/types").HelenaCompany | null;
    }
  | { ok: false; error: string };

const overviewCache = new Map<string, { value: AccountOverviewResult; expires: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export async function getHelenaAccountOverview(clinicId: string) {
  try {
    const now = Date.now();
    const cached = overviewCache.get(clinicId);
    if (cached && cached.expires > now) {
      return cached.value;
    }

    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, company_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const companyId = data.company_id as string | null;

    const [contactCount, channels, company] = await Promise.all([
      getContactCount(token).catch(() => 0),
      listChannels(token).catch(() => []),
      companyId ? getCompanyInfo(token, companyId).catch(() => null) : Promise.resolve(null),
    ]);

    const result = {
      ok: true as const,
      contactCount,
      channels,
      company,
    };

    overviewCache.set(clinicId, { value: result, expires: now + CACHE_DURATION });
    return result;
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao obter dados gerais da Helena" };
  }
}

export async function getHelenaChatStatsForMonth(clinicId: string, yearMonth: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const stats = await getChatCounts(token, monthRangeUtc(yearMonth));

    return { ok: true as const, stats };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler estatísticas de chat" };
  }
}

// Cache do IA vs Humano por clínica+mês (a contagem pagina todas as sessões do mês).
const takeoverCache = new Map<string, { value: unknown; expires: number }>();
const TAKEOVER_CACHE_MS = 5 * 60 * 1000;

/** % de atendimentos assumidos por humano no mês (sessões com atendente designado). */
export async function getHelenaTakeoverStats(clinicId: string, yearMonth: string) {
  try {
    const cacheKey = `${clinicId}:${yearMonth}`;
    const cached = takeoverCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.value as
        | { ok: true; stats: import("@/lib/helena/client").TakeoverStats }
        | { ok: false; error: string };
    }

    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const stats = await getSessionTakeoverStats(token, monthRangeUtc(yearMonth));

    const result = { ok: true as const, stats };
    takeoverCache.set(cacheKey, { value: result, expires: Date.now() + TAKEOVER_CACHE_MS });
    return result;
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler IA vs Humano" };
  }
}

export async function listHelenaTeamsAndUsers(clinicId: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const [departments, users] = await Promise.all([
      listDepartments(token).catch(() => []),
      listUsers(token).catch(() => []),
    ]);

    return { ok: true as const, departments, users };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar equipes/atendentes" };
  }
}

export async function getHelenaCustomFieldsAggregation(clinicId: string, yearMonth: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    if (!data.panel_id)
      return { ok: false as const, error: "Painel ainda não vinculado — crie na Helena e reprocesse" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const panelId = data.panel_id as string;

    const cards = await listCards(token, panelId, monthRangeUtc(yearMonth));
    
    const counts: Record<string, Record<string, number>> = {};

    for (const card of cards) {
      if (card.customFields) {
        for (const [key, val] of Object.entries(card.customFields)) {
          if (val === null || val === undefined || val === "") continue;
          const valStr = String(val);
          // Let's filter out keys that look like IDs or system garbage
          if (key.length > 30 || valStr.length > 60) continue;
          if (!counts[key]) counts[key] = {};
          counts[key][valStr] = (counts[key][valStr] ?? 0) + 1;
        }
      }
    }

    return { ok: true as const, counts };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao obter agregação de campos personalizados" };
  }
}
