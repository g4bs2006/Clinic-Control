import "server-only";
import type { AutomationConfig } from "./automation";

// Tradução linha de `clinic_integrations` ⇄ AutomationConfig. Fica fora do
// arquivo de actions porque um módulo "use server" só pode exportar funções
// async — estes helpers são síncronos e reusados pelas actions, pelo runner do
// lote e pela varredura semanal.

export type AutomationIntegrationRow = {
  automation_enabled?: boolean | null;
  automation_lead_step_id?: string | null;
  automation_scheduled_step_id?: string | null;
  automation_cancelled_step_id?: string | null;
  automation_ia_card_tag_id?: string | null;
  automation_scheduled_contact_tag_id?: string | null;
  automation_scheduled_at_field_key?: string | null;
  automation_scheduled_for_field_key?: string | null;
  automation_campaign_field_key?: string | null;
  automation_fb_panel_tag_id?: string | null;
  automation_fb_contact_tag_id?: string | null;
  automation_ig_panel_tag_id?: string | null;
  automation_ig_contact_tag_id?: string | null;
  automation_org_panel_tag_id?: string | null;
  automation_org_contact_tag_id?: string | null;
};

/**
 * Linha completa como as queries de automação leem. Existe porque o supabase-js
 * só infere o tipo do retorno quando o `select` é literal inline — passando uma
 * constante (para não repetir 20 colunas em 5 lugares) ele devolve
 * GenericStringError, e o cast tem que ser explícito.
 */
export type AutomationFullRow = AutomationIntegrationRow & {
  clinic_id?: string;
  helena_token_encrypted?: string;
  panel_id?: string | null;
  company_id?: string | null;
  scheduled_step_ids?: string[] | null;
  lead_step_ids?: string[] | null;
  automation_warnings?: string[] | null;
  automation_detected_at?: string | null;
};

export function rowToAutomationConfig(row: AutomationIntegrationRow): AutomationConfig {
  return {
    leadStepId: row.automation_lead_step_id ?? null,
    scheduledStepId: row.automation_scheduled_step_id ?? null,
    cancelledStepId: row.automation_cancelled_step_id ?? null,
    iaCardTagId: row.automation_ia_card_tag_id ?? null,
    scheduledContactTagId: row.automation_scheduled_contact_tag_id ?? null,
    scheduledAtFieldKey: row.automation_scheduled_at_field_key ?? null,
    scheduledForFieldKey: row.automation_scheduled_for_field_key ?? null,
    campaignFieldKey: row.automation_campaign_field_key ?? null,
    fbPanelTagId: row.automation_fb_panel_tag_id ?? null,
    fbContactTagId: row.automation_fb_contact_tag_id ?? null,
    igPanelTagId: row.automation_ig_panel_tag_id ?? null,
    igContactTagId: row.automation_ig_contact_tag_id ?? null,
    orgPanelTagId: row.automation_org_panel_tag_id ?? null,
    orgContactTagId: row.automation_org_contact_tag_id ?? null,
  };
}

export function automationConfigToRow(config: AutomationConfig) {
  return {
    automation_lead_step_id: config.leadStepId,
    automation_scheduled_step_id: config.scheduledStepId,
    automation_cancelled_step_id: config.cancelledStepId,
    automation_ia_card_tag_id: config.iaCardTagId,
    automation_scheduled_contact_tag_id: config.scheduledContactTagId,
    automation_scheduled_at_field_key: config.scheduledAtFieldKey,
    automation_scheduled_for_field_key: config.scheduledForFieldKey,
    automation_campaign_field_key: config.campaignFieldKey,
    automation_fb_panel_tag_id: config.fbPanelTagId,
    automation_fb_contact_tag_id: config.fbContactTagId,
    automation_ig_panel_tag_id: config.igPanelTagId,
    automation_ig_contact_tag_id: config.igContactTagId,
    automation_org_panel_tag_id: config.orgPanelTagId,
    automation_org_contact_tag_id: config.orgContactTagId,
  };
}

/** Colunas lidas em toda operação de automação (config + contexto do funil). */
export const AUTOMATION_SELECT =
  "helena_token_encrypted, panel_id, company_id, scheduled_step_ids, lead_step_ids, " +
  "automation_enabled, automation_warnings, automation_detected_at, " +
  "automation_lead_step_id, automation_scheduled_step_id, automation_cancelled_step_id, " +
  "automation_ia_card_tag_id, automation_scheduled_contact_tag_id, " +
  "automation_scheduled_at_field_key, automation_scheduled_for_field_key, " +
  "automation_campaign_field_key, " +
  "automation_fb_panel_tag_id, automation_fb_contact_tag_id, " +
  "automation_ig_panel_tag_id, automation_ig_contact_tag_id, " +
  "automation_org_panel_tag_id, automation_org_contact_tag_id";

/** Só as colunas de config — usado onde o token não é necessário. */
export const AUTOMATION_CONFIG_SELECT =
  "clinic_id, company_id, automation_enabled, automation_warnings, automation_detected_at, " +
  "automation_lead_step_id, automation_scheduled_step_id, automation_cancelled_step_id, " +
  "automation_ia_card_tag_id, automation_scheduled_contact_tag_id, " +
  "automation_scheduled_at_field_key, automation_scheduled_for_field_key, " +
  "automation_campaign_field_key, " +
  "automation_fb_panel_tag_id, automation_fb_contact_tag_id, " +
  "automation_ig_panel_tag_id, automation_ig_contact_tag_id, " +
  "automation_org_panel_tag_id, automation_org_contact_tag_id";
