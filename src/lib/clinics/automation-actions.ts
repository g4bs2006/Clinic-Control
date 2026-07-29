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
  type AutomationCatalog,
  type AutomationConfig,
  type AutomationDetection,
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
import { projectAutomationConfig, listAutomacaoClinicasRows } from "./automation-projection";

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

    await kickAutomationJob(job.id as string);
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
 * Dispara um tick do job. Mesmo padrão dos outros jobs: assinatura HMAC interna
 * + fetch de timeout curto (basta a request chegar). Se o encadeamento se
 * perder, o polling da UI reencosta chamando de novo.
 */
export async function kickAutomationJob(jobId: string): Promise<void> {
  const sig = await signSessionToken(`automacao:${jobId}`, Date.now() + 10 * 60 * 1000);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  if (!host) return;
  try {
    await fetch(`${proto}://${host}/api/automacao/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, sig }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    /* coberto pelo auto-kick do polling */
  }
}
