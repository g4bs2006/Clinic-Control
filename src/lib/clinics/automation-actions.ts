"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";
import { decryptToken } from "@/lib/crypto/token";
import { signSessionToken } from "@/lib/auth/token";
import {
  detectAutomation,
  automationFunnelConflicts,
  automationReadiness,
  missingAutomationFields,
  AUTOMATION_FIELDS,
  AUTOMATION_FIELD_LABEL,
  AUTOMATION_FIELD_SOURCE,
  type AutomationCatalog,
  type AutomationConfig,
  type AutomationDetection,
  type AutomationFieldName,
  type AutomationReadiness,
} from "./automation";
import {
  rowToAutomationConfig,
  automationConfigToRow,
  AUTOMATION_SELECT,
  AUTOMATION_CONFIG_SELECT,
  type AutomationFullRow,
} from "./automation-row";
import { loadAutomationCatalog } from "./automation-catalog";
import {
  projectAutomationConfig,
  listAutomacaoClinicasRows,
  type AutomacaoClinicasRow,
} from "./automation-projection";

// Auth: mesma política das demais actions de integração — basta usuário
// autenticado (staff interno é confiável, ver a nota em integration-actions.ts).

// ── Tela de configuração da clínica ─────────────────────────────────────────

export type AutomationSetup = {
  enabled: boolean;
  config: AutomationConfig;
  catalog: AutomationCatalog;
  /** Avisos da última detecção salva (não da edição manual). */
  savedWarnings: string[];
  detectedAt: string | null;
  /** Incoerências entre a automação e o mapeamento do funil da mesma clínica. */
  conflicts: string[];
  readiness: AutomationReadiness;
};

export async function getAutomationSetup(
  clinicId: string,
): Promise<{ ok: true; setup: AutomationSetup } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select(AUTOMATION_SELECT)
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    const row = data as unknown as AutomationFullRow;
    if (!row.panel_id)
      return {
        ok: false as const,
        error: "Painel ainda não vinculado — crie na Helena e reprocesse",
      };

    const token = decryptToken(row.helena_token_encrypted as string);
    const catalog = await loadAutomationCatalog(token, row.panel_id);
    const config = rowToAutomationConfig(row);

    return {
      ok: true as const,
      setup: {
        enabled: row.automation_enabled === true,
        config,
        catalog,
        savedWarnings: row.automation_warnings ?? [],
        detectedAt: row.automation_detected_at ?? null,
        conflicts: automationFunnelConflicts(
          config,
          {
            scheduledStepIds: row.scheduled_step_ids ?? null,
            leadStepIds: row.lead_step_ids ?? null,
          },
          catalog.steps,
        ),
        readiness: automationReadiness(config),
      },
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao carregar a automação",
    };
  }
}

/**
 * Roda a detecção e DEVOLVE a proposta, sem salvar — detectar não é decidir. O
 * gestor revisa no formulário e confirma. (A varredura em lote é que grava, e
 * só onde está vazio.)
 */
export async function detectAutomationForClinic(
  clinicId: string,
): Promise<{ ok: true; detection: AutomationDetection } | { ok: false; error: string }> {
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
    if (!data.panel_id) return { ok: false as const, error: "Painel ainda não vinculado" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const catalog = await loadAutomationCatalog(token, data.panel_id as string);
    return { ok: true as const, detection: detectAutomation(catalog) };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao detectar na Helena",
    };
  }
}

/**
 * Salva a configuração e espelha na tabela do n8n na mesma operação. Se o
 * espelho falhar o salvamento continua válido, mas a action devolve o aviso —
 * silenciar isso deixaria o n8n rodando com config velha sem ninguém saber.
 */
export async function saveAutomationConfig(
  clinicId: string,
  input: { enabled: boolean; config: AutomationConfig },
): Promise<{ ok: true; projectionWarning?: string } | { ok: false; error: string }> {
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
      return {
        ok: false as const,
        error: "Integração não encontrada — salve a integração Helena primeiro",
      };

    // Edição manual NÃO mexe em automation_warnings/detected_at: aqueles campos
    // são o resultado da última varredura contra a Helena, e sobrescrevê-los aqui
    // faria a config parecer validada quando ninguém validou.
    const { error } = await supabase
      .from("clinic_integrations")
      .update({ ...automationConfigToRow(input.config), automation_enabled: input.enabled })
      .eq("clinic_id", clinicId);
    if (error) return { ok: false as const, error: error.message };

    const projection = await projectClinicAutomation(clinicId);
    return projection.ok
      ? { ok: true as const }
      : { ok: true as const, projectionWarning: projection.error };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao salvar a automação",
    };
  }
}

/**
 * Espelha uma clínica na tabela do n8n a partir do que está salvo no
 * clinic_control. Exportada porque o runner do lote e a varredura reusam.
 */
export async function projectClinicAutomation(
  clinicId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clinic_integrations")
    .select(AUTOMATION_SELECT)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Integração não encontrada" };
  const row = data as unknown as AutomationFullRow;
  if (!row.company_id)
    return {
      ok: false,
      error: "Clínica sem company_id da Helena — o n8n casa as linhas por esse id",
    };
  if (!row.panel_id) return { ok: false, error: "Painel não vinculado" };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", clinicId)
    .maybeSingle();

  const res = await projectAutomationConfig({
    companyId: row.company_id,
    // O nome vem do cadastro do Clinic Control — é isto que corrige as linhas
    // que ficaram com o nome de outra clínica na tabela do n8n.
    clinicName: (clinic?.name as string | undefined) ?? "Sem nome",
    tokenEncrypted: row.helena_token_encrypted as string,
    panelId: row.panel_id,
    enabled: row.automation_enabled === true,
    config: rowToAutomationConfig(row),
    warnings: row.automation_warnings ?? [],
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * A automação é configurável para esta clínica? Consulta só o banco — serve para
 * a página decidir se mostra o painel, SEM chamar a API da Helena no
 * carregamento (a página da clínica é otimizada para uma rodada de fetch).
 */
export async function automationIsConfigurable(clinicId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("clinic_integrations")
    .select("panel_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return Boolean(data?.panel_id);
}

// ── Diagnóstico detalhado da clínica ────────────────────────────────────────

export type AutomationFieldDiagnostic = {
  field: AutomationFieldName;
  label: string;
  /** Valor cru como está no banco (uuid ou key do campo). */
  stored: string | null;
  /** Nome resolvido no catálogo da Helena. Null quando o id não existe mais lá. */
  resolvedLabel: string | null;
  /** Id gravado que não existe no catálogo — aponta para outro painel ou foi apagado. */
  orphan: boolean;
  /** O que a tabela do n8n tem hoje nesse mesmo campo. */
  mirrored: string | null;
  /** Espelho diferente do que está aqui (o n8n está lendo outra coisa). */
  drifted: boolean;
};

export type AutomationDiagnostics = {
  enabled: boolean;
  fields: AutomationFieldDiagnostic[];
  detectedAt: string | null;
  warnings: string[];
  conflicts: string[];
  readiness: AutomationReadiness;
  /** Estado da linha espelhada: existe? ativa? desde quando? */
  mirror: {
    exists: boolean;
    nome: string | null;
    ativo: boolean | null;
    panelId: string | null;
    statusObs: string | null;
    updatedAt: string | null;
    /** panel_id do espelho diferente do painel vinculado no app. */
    panelDrifted: boolean;
  };
  panelId: string;
  companyId: string | null;
};

/** Qual coluna do espelho corresponde a cada campo — para comparar lado a lado. */
const MIRROR_COLUMN: Record<AutomationFieldName, keyof AutomacaoClinicasRow> = {
  leadStepId: "step_id",
  scheduledStepId: "agendado_step_id",
  cancelledStepId: "cancelado_step_id",
  iaCardTagId: "ia_card_tag_id",
  scheduledContactTagId: "agendado_contact_tag_id",
  scheduledAtFieldKey: "agendado_em_field_key",
  scheduledForFieldKey: "agendado_para_field_key",
  fbPanelTagId: "fb_panel_tag_id",
  fbContactTagId: "fb_contact_tag_id",
  igPanelTagId: "ig_panel_tag_id",
  igContactTagId: "ig_contact_tag_id",
  orgPanelTagId: "org_panel_tag_id",
  orgContactTagId: "org_contact_tag_id",
};

/**
 * Visão destrinchada da automação de uma clínica: para cada campo, o valor CRU
 * gravado, o nome que ele tem na Helena hoje, se o id virou órfão (aponta para
 * painel/coluna que não existe mais) e o que a tabela do n8n está lendo naquele
 * mesmo campo. É o que permite ver de onde vem cada coisa sem abrir o banco.
 */
export async function getAutomationDiagnostics(
  clinicId: string,
): Promise<{ ok: true; diagnostics: AutomationDiagnostics } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select(AUTOMATION_SELECT)
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    const row = data as unknown as AutomationFullRow;
    if (!row.panel_id)
      return {
        ok: false as const,
        error: "Painel ainda não vinculado — crie na Helena e reprocesse",
      };

    const token = decryptToken(row.helena_token_encrypted as string);
    const catalog = await loadAutomationCatalog(token, row.panel_id);
    const config = rowToAutomationConfig(row);

    // Índice id/key → nome, juntando os quatro catálogos. Não há colisão prática
    // entre eles (uuid vs key de campo), e olhar o catálogo certo por campo já é
    // garantido por AUTOMATION_FIELD_SOURCE na UI.
    const labelById = new Map<string, string>();
    for (const s of catalog.steps) labelById.set(s.id, s.title);
    for (const t of catalog.panelTags) labelById.set(t.id, t.name);
    for (const t of catalog.contactTags) labelById.set(t.id, t.name);
    for (const f of catalog.customFields) labelById.set(f.key, f.name);

    const mirrorRows = await listAutomacaoClinicasRows().catch(() => []);
    const mirrorRow = row.company_id
      ? mirrorRows.find((r) => r.helena_company_id === row.company_id)
      : undefined;

    const fields: AutomationFieldDiagnostic[] = AUTOMATION_FIELDS.map((field) => {
      const stored = config[field];
      const mirrored = mirrorRow
        ? ((mirrorRow[MIRROR_COLUMN[field]] as string | null) ?? null)
        : null;
      return {
        field,
        label: AUTOMATION_FIELD_LABEL[field],
        stored,
        resolvedLabel: stored ? (labelById.get(stored) ?? null) : null,
        orphan: Boolean(stored) && !labelById.has(stored as string),
        mirrored,
        drifted: Boolean(mirrorRow) && (stored ?? null) !== mirrored,
      };
    });

    return {
      ok: true as const,
      diagnostics: {
        enabled: row.automation_enabled === true,
        fields,
        detectedAt: row.automation_detected_at ?? null,
        warnings: row.automation_warnings ?? [],
        conflicts: automationFunnelConflicts(
          config,
          {
            scheduledStepIds: row.scheduled_step_ids ?? null,
            leadStepIds: row.lead_step_ids ?? null,
          },
          catalog.steps,
        ),
        readiness: automationReadiness(config),
        mirror: {
          exists: Boolean(mirrorRow),
          nome: mirrorRow?.nome ?? null,
          ativo: mirrorRow?.ativo ?? null,
          panelId: mirrorRow?.panel_id ?? null,
          statusObs: mirrorRow?.status_obs ?? null,
          updatedAt: mirrorRow?.updated_at ?? null,
          panelDrifted: Boolean(
            mirrorRow?.panel_id && row.panel_id && mirrorRow.panel_id !== row.panel_id,
          ),
        },
        panelId: row.panel_id,
        companyId: row.company_id ?? null,
      },
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao diagnosticar a automação",
    };
  }
}

/**
 * Refaz a busca de UM campo na Helena e devolve o resultado para o formulário —
 * inclusive quando o campo já tem valor (é o caso de uso: o gravado está errado
 * ou virou órfão). NÃO grava: quem confirma é o Salvar, igual ao "Detectar"
 * geral. Se a heurística achar mais de uma candidata, não escolhe por você.
 */
export async function redetectAutomationField(
  clinicId: string,
  field: AutomationFieldName,
): Promise<
  | { ok: true; value: string; label: string; candidates: { id: string; label: string }[] }
  | { ok: true; value: null; label: null; candidates: { id: string; label: string }[] }
  | { ok: false; error: string }
> {
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
    if (!data.panel_id) return { ok: false as const, error: "Painel ainda não vinculado" };

    const token = decryptToken(data.helena_token_encrypted as string);
    const catalog = await loadAutomationCatalog(token, data.panel_id as string);
    const detection = detectAutomation(catalog);
    const candidates = detection.candidates[field] ?? [];

    const value = detection.config[field];
    if (!value) return { ok: true as const, value: null, label: null, candidates };

    const source = AUTOMATION_FIELD_SOURCE[field];
    const label =
      source === "step"
        ? (catalog.steps.find((s) => s.id === value)?.title ?? value)
        : source === "customField"
          ? (catalog.customFields.find((f) => f.key === value)?.name ?? value)
          : source === "panelTag"
            ? (catalog.panelTags.find((t) => t.id === value)?.name ?? value)
            : (catalog.contactTags.find((t) => t.id === value)?.name ?? value);

    return { ok: true as const, value, label, candidates };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao redetectar o campo",
    };
  }
}

/**
 * Reenvia a configuração salva para a tabela do n8n, sem alterar nada aqui.
 * Serve para quando o espelho ficou para trás (falha de rede no salvamento, ou
 * alguém editou a tabela do n8n por fora).
 */
export async function reprojectAutomation(
  clinicId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  return projectClinicAutomation(clinicId);
}

// ── Visão de carteira ───────────────────────────────────────────────────────

export type AutomationOverviewItem = {
  clinicId: string;
  clinicName: string;
  mode: string;
  contractStatus: string;
  enabled: boolean;
  readiness: AutomationReadiness;
  missingCount: number;
  warnings: string[];
  detectedAt: string | null;
  /** Divergências entre o Clinic Control e a linha espelhada no n8n. */
  divergences: string[];
};

/**
 * Estado da automação na carteira ativa — só banco, nenhuma chamada à Helena
 * (a tela precisa abrir rápido; detectar é ação explícita).
 */
export async function listAutomationOverview(): Promise<
  { ok: true; items: AutomationOverviewItem[]; orphans: string[] } | { ok: false; error: string }
> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const { developerFilter } = await getCarteiraScope();
    const supabase = createServiceClient();

    let clinicQuery = supabase
      .from("clinics")
      .select("id, name, mode, contract_status, developer_id")
      .neq("contract_status", "archived");
    if (developerFilter) clinicQuery = clinicQuery.eq("developer_id", developerFilter);
    const { data: clinics, error: clinicErr } = await clinicQuery.order("name");
    if (clinicErr) return { ok: false as const, error: clinicErr.message };

    const ids = (clinics ?? []).map((c) => c.id as string);
    if (ids.length === 0) return { ok: true as const, items: [], orphans: [] };

    const { data: integrations, error: integErr } = await supabase
      .from("clinic_integrations")
      .select(AUTOMATION_CONFIG_SELECT)
      .in("clinic_id", ids);
    if (integErr) return { ok: false as const, error: integErr.message };

    // A tabela do n8n é lida só para APONTAR divergência — nunca para decidir.
    const mirror = await listAutomacaoClinicasRows().catch(() => []);
    const mirrorByCompany = new Map(mirror.map((r) => [r.helena_company_id, r]));
    const companiesUsed = new Set<string>();
    const integRows = (integrations ?? []) as unknown as AutomationFullRow[];
    const integByClinic = new Map(integRows.map((i) => [i.clinic_id as string, i]));

    const items: AutomationOverviewItem[] = [];
    for (const c of clinics ?? []) {
      const integ = integByClinic.get(c.id as string);
      if (!integ) continue; // sem integração Helena = automação não se aplica

      const config = rowToAutomationConfig(integ);
      const enabled = integ.automation_enabled === true;
      const companyId = integ.company_id ?? null;
      const mirrorRow = companyId ? mirrorByCompany.get(companyId) : undefined;
      if (companyId && mirrorRow) companiesUsed.add(companyId);

      const divergences: string[] = [];
      if (mirrorRow) {
        if ((mirrorRow.nome ?? "") !== (c.name as string))
          divergences.push(`nome no n8n é “${mirrorRow.nome ?? "—"}”`);
        if (config.scheduledStepId && mirrorRow.agendado_step_id !== config.scheduledStepId)
          divergences.push("etapa de agendamento diferente da espelhada");
        if (Boolean(mirrorRow.ativo) !== enabled)
          divergences.push(
            `ativo no n8n é ${mirrorRow.ativo ? "sim" : "não"} e aqui é ${enabled ? "sim" : "não"}`,
          );
      } else if (enabled) {
        divergences.push("ligada aqui, mas sem linha no n8n");
      }

      items.push({
        clinicId: c.id as string,
        clinicName: c.name as string,
        mode: c.mode as string,
        contractStatus: c.contract_status as string,
        enabled,
        readiness: automationReadiness(config),
        missingCount: missingAutomationFields(config).length,
        warnings: integ.automation_warnings ?? [],
        detectedAt: integ.automation_detected_at ?? null,
        divergences,
      });
    }

    // Linhas no n8n sem clínica correspondente no escopo — o caso que ninguém
    // enxergava: automação rodando para algo que o app não conhece.
    const orphans = mirror
      .filter((r) => !companiesUsed.has(r.helena_company_id))
      .map((r) => `${r.nome ?? "sem nome"} (company ${r.helena_company_id.slice(0, 8)}…)`);

    return { ok: true as const, items, orphans };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao carregar o panorama da automação",
    };
  }
}

// ── Detecção em lote (job com checkpoint) ───────────────────────────────────

export type AutomationJob = {
  id: string;
  status: string;
  progress_done: number;
  progress_total: number;
  apply_empty: boolean;
  stats: { detected?: number; applied?: number; incomplete?: number; errors?: string[] } | null;
  error: string | null;
  created_at: string;
};

const JOB_SELECT =
  "id, status, progress_done, progress_total, apply_empty, stats, error, created_at";

/** Dispara a varredura da carteira ativa e devolve o job para a UI acompanhar. */
export async function startAutomationScan(
  applyEmpty = true,
): Promise<{ ok: true; job: AutomationJob } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const { developerFilter } = await getCarteiraScope();
    const supabase = createServiceClient();

    let q = supabase
      .from("clinics")
      .select("id, developer_id, contract_status")
      .neq("contract_status", "archived");
    if (developerFilter) q = q.eq("developer_id", developerFilter);
    const { data: clinics, error: clinicErr } = await q;
    if (clinicErr) return { ok: false as const, error: clinicErr.message };

    const ids = (clinics ?? []).map((c) => c.id as string);
    if (ids.length === 0) return { ok: false as const, error: "Nenhuma clínica no escopo" };

    // Só faz sentido varrer quem tem integração Helena com painel vinculado.
    const { data: integrations } = await supabase
      .from("clinic_integrations")
      .select("clinic_id, panel_id")
      .in("clinic_id", ids);
    const scoped = (integrations ?? []).filter((i) => i.panel_id).map((i) => i.clinic_id as string);
    if (scoped.length === 0)
      return { ok: false as const, error: "Nenhuma clínica com painel da Helena vinculado" };

    const { data: job, error } = await supabase
      .from("automation_jobs")
      .insert({
        requested_by: user.id,
        clinic_ids: scoped,
        progress_total: scoped.length,
        apply_empty: applyEmpty,
        status: "queued",
      })
      .select(JOB_SELECT)
      .single();
    if (error || !job) return { ok: false as const, error: error?.message ?? "Falha ao criar job" };

    // Não dispara o primeiro tick aqui: quem roda a sequência é o painel, que
    // precisa do job na tela antes de começar a avançar.
    return { ok: true as const, job: job as AutomationJob };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao iniciar a varredura",
    };
  }
}

export async function getAutomationJob(
  jobId: string,
): Promise<{ ok: true; job: AutomationJob } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("automation_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "Job não encontrado" };
  return { ok: true as const, job: data as AutomationJob };
}

/**
 * Roda UM tick do job e devolve o progresso. É o motor da varredura: o painel
 * chama em sequência até `done`, mostrando o avanço a cada volta.
 *
 * Espera o tick terminar de propósito (~4s). A versão anterior abortava em 3s
 * para "não bloquear", e era justamente isso que matava a corrente — sem
 * resposta entregue, o `after()` do endpoint não roda (ver o comentário em
 * app/api/automacao/process/route.ts). Bloquear alguns segundos com o progresso
 * visível é melhor que um job que para em silêncio.
 */
export async function kickAutomationJob(
  jobId: string,
): Promise<{ done: boolean; progress: number; total: number } | null> {
  const sig = await signSessionToken(`automacao:${jobId}`, Date.now() + 30 * 60 * 1000);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  if (!host) return null;
  try {
    const res = await fetch(`${proto}://${host}/api/automacao/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, sig }),
      // Teto generoso: só existe para não pendurar a action se o app não se
      // alcançar. Um tick normal responde em ~4s.
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { done: boolean; progress: number; total: number };
  } catch {
    return null; // a próxima volta do painel tenta de novo
  }
}
