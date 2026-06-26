"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import { listPanels, getPanelWithSteps, listCards } from "@/lib/helena/client";
import { buildLiveFunnel } from "@/lib/helena/funnel";

export async function listPanelsForToken(token: string) {
  try {
    const panels = await listPanels(token);
    return { ok: true as const, panels };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar painéis" };
  }
}

export async function saveIntegration(clinicId: string, token: string, panelId: string) {
  try {
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

function monthRangeUtc(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { after: start, before: end };
}

export async function getLiveFunnel(clinicId: string) {
  try {
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
    const range = monthRangeUtc();
    const cards = await listCards(token, panelId, range);
    return { ok: true as const, funnel: buildLiveFunnel(steps, cards) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler o funil" };
  }
}
