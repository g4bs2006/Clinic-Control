"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import {
  listPanels,
  getPanelWithSteps,
  listCards,
  getContactCount,
  getChatCounts,
  getCompanyInfo,
  listDepartments,
  listUsers,
  listChannels,
} from "@/lib/helena/client";
import { buildLiveFunnel } from "@/lib/helena/funnel";
import { monthKey, monthRangeUtc } from "@/lib/snapshots/month";

// Auth design note: these actions gate on "is there an authenticated user?" only.
// They do NOT check per-clinic membership/ownership because the app model treats every
// authenticated user as trusted internal staff with full access to all clinics — the same
// policy used by Phase 1 RLS (authenticated role = full access). A per-clinic gate here
// would be inconsistent with that model and is intentionally omitted.

export async function listPanelsForToken(token: string) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };
    const panels = await listPanels(token);
    return { ok: true as const, panels };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar painéis" };
  }
}

export async function getHelenaSetupOverview(token: string) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
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
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
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
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const panelId = data.panel_id as string;
    const { steps } = await getPanelWithSteps(token, panelId);
    const cards = await listCards(token, panelId, monthRangeUtc(yearMonth));
    return { ok: true as const, funnel: buildLiveFunnel(steps, cards) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler o funil" };
  }
}

export async function getLiveFunnel(clinicId: string) {
  return getFunnelForMonth(clinicId, monthKey(new Date()));
}

export type ClinicLead = { name: string; step: string; date: string };

// Lista os leads (cards) do mês corrente de uma clínica auto, mapeando cada
// card para a etapa atual. Reusa o gate de auth + service client das demais
// actions de integração. Tolera clínica sem integração (retorna ok:false).
export async function listClinicLeads(
  clinicId: string,
): Promise<{ ok: true; leads: ClinicLead[] } | { ok: false; error: string }> {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

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

const overviewCache = new Map<string, { value: any; expires: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export async function getHelenaAccountOverview(clinicId: string) {
  try {
    const now = Date.now();
    const cached = overviewCache.get(clinicId);
    if (cached && cached.expires > now) {
      return cached.value;
    }

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
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
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
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

export async function listHelenaTeamsAndUsers(clinicId: string) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
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
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };

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
