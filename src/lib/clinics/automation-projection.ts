import "server-only";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/token";
import type { AutomationConfig } from "./automation";

// Projeção da configuração de automação para `public.automacao_clinicas` — a
// tabela que os workflows do n8n leem. O clinic_control é a fonte da verdade;
// esta tabela é um ESPELHO DE LEITURA, reescrito a cada salvamento/detecção.
//
// Por que espelho e não view: o token da Helena fica cifrado (AES-256-GCM) no
// clinic_control e a chave vive no ambiente do app, não no banco — uma view em
// SQL não conseguiria entregar o token em claro que o n8n precisa. Enquanto a
// leitura for por tabela, alguém tem que decifrar e escrever, e esse alguém é o
// app. (Se um dia os workflows passarem a ler por HTTP, isto morre junto.)
//
// `back_panel_id` é deliberadamente NÃO tocado: saiu do escopo, então o valor
// que estiver lá é preservado no update em vez de ser zerado.

/**
 * Client no schema `public` — o resto do app fala com `clinic_control`. É o
 * único lugar do código que escreve fora do nosso schema, de propósito.
 */
function createPublicServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "public" } },
  );
}

export type ProjectionInput = {
  companyId: string;
  clinicName: string;
  tokenEncrypted: string;
  panelId: string;
  enabled: boolean;
  config: AutomationConfig;
  warnings: string[];
};

/** Rótulos de origem que a tabela do n8n guarda junto do id da etiqueta. */
const ORIGIN_LABEL = { fb: "Facebook", ig: "Instagram", org: "Organico" } as const;

function buildRow(input: ProjectionInput) {
  const c = input.config;
  return {
    nome: input.clinicName,
    helena_token: decryptToken(input.tokenEncrypted),
    panel_id: input.panelId,
    ativo: input.enabled,
    step_id: c.leadStepId,
    agendado_step_id: c.scheduledStepId,
    cancelado_step_id: c.cancelledStepId,
    ia_card_tag_id: c.iaCardTagId,
    agendado_contact_tag_id: c.scheduledContactTagId,
    agendado_em_field_key: c.scheduledAtFieldKey,
    agendado_para_field_key: c.scheduledForFieldKey,
    campanha_field_key: c.campaignFieldKey,
    fb_tag_nome: ORIGIN_LABEL.fb,
    fb_panel_tag_id: c.fbPanelTagId,
    fb_contact_tag_id: c.fbContactTagId,
    ig_tag_nome: ORIGIN_LABEL.ig,
    ig_panel_tag_id: c.igPanelTagId,
    ig_contact_tag_id: c.igContactTagId,
    org_tag_nome: ORIGIN_LABEL.org,
    org_panel_tag_id: c.orgPanelTagId,
    org_contact_tag_id: c.orgContactTagId,
    // Mesmo contrato de antes: 'ok' ou os avisos concatenados. O dado
    // estruturado vive em clinic_integrations.automation_warnings.
    status_obs: input.warnings.length > 0 ? input.warnings.join(" | ") : "ok",
  };
}

export type ProjectionResult =
  | { ok: true; action: "inserted" | "updated" }
  | { ok: false; error: string };

/**
 * Espelha a configuração na tabela do n8n. Casa por `helena_company_id` (a
 * chave que os workflows usam; foi por ela que as 21 linhas existentes casaram
 * 1:1 com a carteira). Faz select→update/insert em vez de upsert porque não há
 * garantia de constraint única na coluna do lado `public`.
 */
export async function projectAutomationConfig(
  input: ProjectionInput,
): Promise<ProjectionResult> {
  try {
    const pub = createPublicServiceClient();
    const row = buildRow(input);

    const { data: existing, error: selErr } = await pub
      .from("automacao_clinicas")
      .select("id")
      .eq("helena_company_id", input.companyId)
      .limit(1)
      .maybeSingle();
    if (selErr) return { ok: false, error: selErr.message };

    if (existing) {
      const { error } = await pub
        .from("automacao_clinicas")
        .update(row)
        .eq("id", existing.id as string);
      if (error) return { ok: false, error: error.message };
      return { ok: true, action: "updated" };
    }

    const { error } = await pub
      .from("automacao_clinicas")
      .insert({ ...row, helena_company_id: input.companyId });
    if (error) return { ok: false, error: error.message };
    return { ok: true, action: "inserted" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao espelhar para o n8n" };
  }
}

export type AutomacaoClinicasRow = {
  id: string;
  helena_company_id: string;
  nome: string | null;
  panel_id: string | null;
  ativo: boolean | null;
  step_id: string | null;
  agendado_step_id: string | null;
  cancelado_step_id: string | null;
  ia_card_tag_id: string | null;
  agendado_contact_tag_id: string | null;
  agendado_em_field_key: string | null;
  agendado_para_field_key: string | null;
  campanha_field_key: string | null;
  fb_panel_tag_id: string | null;
  fb_contact_tag_id: string | null;
  ig_panel_tag_id: string | null;
  ig_contact_tag_id: string | null;
  org_panel_tag_id: string | null;
  org_contact_tag_id: string | null;
  status_obs: string | null;
  updated_at: string | null;
};

/**
 * Lê as linhas da tabela do n8n — sem o token, que não precisa sair daqui.
 * Usado na reconciliação e no painel de divergências.
 */
export async function listAutomacaoClinicasRows(): Promise<AutomacaoClinicasRow[]> {
  const pub = createPublicServiceClient();
  const { data, error } = await pub
    .from("automacao_clinicas")
    .select(
      "id, helena_company_id, nome, panel_id, ativo, step_id, agendado_step_id, cancelado_step_id, ia_card_tag_id, agendado_contact_tag_id, agendado_em_field_key, agendado_para_field_key, campanha_field_key, fb_panel_tag_id, fb_contact_tag_id, ig_panel_tag_id, ig_contact_tag_id, org_panel_tag_id, org_contact_tag_id, status_obs, updated_at",
    );
  if (error) throw new Error(error.message);
  return (data ?? []) as AutomacaoClinicasRow[];
}
