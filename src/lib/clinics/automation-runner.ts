import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/crypto/token";
import { createNotifications } from "@/lib/notifications/create";
import {
  detectAutomation,
  mergeDetectionIntoEmpty,
  warningsForEmptyFields,
  automationFunnelConflicts,
  missingAutomationFields,
  type AutomationConfig,
} from "./automation";
import {
  rowToAutomationConfig,
  automationConfigToRow,
  AUTOMATION_SELECT,
  type AutomationFullRow,
} from "./automation-row";
import { loadAutomationCatalog } from "./automation-catalog";
import { projectAutomationConfig } from "./automation-projection";

// Varredura da automação em lote, com checkpoint. Cada clínica são ~3 chamadas à
// API da Helena, então o tick processa um punhado e devolve — o encadeamento
// continua no próximo. Mesmo desenho de report_jobs/suggestion_jobs.

/** Clínicas por tick. Baixo o suficiente para caber folgado no maxDuration. */
const BATCH = 4;

export type AutomationJobStats = {
  detected: number;
  applied: number;
  incomplete: number;
  errors: string[];
  /** Clínicas com pendência, para a notificação da varredura automática. */
  flagged: { clinicId: string; clinicName: string; missing: number; conflicts: number }[];
};

function emptyStats(): AutomationJobStats {
  return { detected: 0, applied: 0, incomplete: 0, errors: [], flagged: [] };
}

/**
 * Varre uma clínica: detecta na Helena, preenche o que está vazio (se o job
 * pedir), registra avisos/conflitos e espelha para o n8n.
 */
async function scanClinic(
  clinicId: string,
  applyEmpty: boolean,
): Promise<{
  clinicName: string;
  filled: number;
  missing: number;
  conflicts: number;
} | { error: string }> {
  const supabase = createServiceClient();

  const [{ data: integData }, { data: clinic }] = await Promise.all([
    supabase
      .from("clinic_integrations")
      .select(AUTOMATION_SELECT)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle(),
  ]);
  const clinicName = (clinic?.name as string | undefined) ?? clinicId.slice(0, 8);
  if (!integData) return { error: `${clinicName}: integração não encontrada` };
  const integ = integData as unknown as AutomationFullRow;
  if (!integ.panel_id) return { error: `${clinicName}: painel não vinculado` };

  const token = decryptToken(integ.helena_token_encrypted as string);
  const catalog = await loadAutomationCatalog(token, integ.panel_id);
  const detection = detectAutomation(catalog);

  const saved = rowToAutomationConfig(integ);
  const { config, filled } = applyEmpty
    ? mergeDetectionIntoEmpty(saved, detection.config)
    : { config: saved, filled: [] as ReturnType<typeof mergeDetectionIntoEmpty>["filled"] };

  const conflicts = automationFunnelConflicts(
    config,
    {
      scheduledStepIds: integ.scheduled_step_ids ?? null,
      leadStepIds: integ.lead_step_ids ?? null,
    },
    catalog.steps,
  );
  const warnings = [...warningsForEmptyFields(detection.warnings, config), ...conflicts];

  const { error: updErr } = await supabase
    .from("clinic_integrations")
    .update({
      ...(filled.length > 0 ? automationConfigToRow(config) : {}),
      automation_warnings: warnings,
      automation_detected_at: new Date().toISOString(),
    })
    .eq("clinic_id", clinicId);
  if (updErr) return { error: `${clinicName}: ${updErr.message}` };

  // Espelha para o n8n. Sem company_id não há como casar a linha — é aviso, não
  // erro de varredura (a detecção em si funcionou).
  if (integ.company_id) {
    const res = await projectAutomationConfig({
      companyId: integ.company_id,
      clinicName,
      tokenEncrypted: integ.helena_token_encrypted as string,
      panelId: integ.panel_id,
      enabled: integ.automation_enabled === true,
      config,
      warnings,
    });
    if (!res.ok) return { error: `${clinicName}: espelho para o n8n falhou — ${res.error}` };
  }

  return {
    clinicName,
    filled: filled.length,
    missing: missingAutomationFields(config).length,
    conflicts: conflicts.length,
  };
}

export type TickResult = { done: boolean; progress: number; total: number; error?: string };

/**
 * Processa um tick do job. Idempotente por checkpoint: se o mesmo tick rodar
 * duas vezes, reprocessa o mesmo lote — detectar é leitura, e a escrita é
 * upsert/update, então repetir não estraga nada.
 */
export async function processAutomationJob(jobId: string): Promise<TickResult> {
  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("automation_jobs")
    .select("id, clinic_ids, status, progress_done, progress_total, apply_empty, stats, requested_by")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { done: true, progress: 0, total: 0, error: "Job não encontrado" };
  if (job.status === "done" || job.status === "error") {
    return { done: true, progress: job.progress_done as number, total: job.progress_total as number };
  }

  const clinicIds = (job.clinic_ids as string[]) ?? [];
  const done = job.progress_done as number;
  const batch = clinicIds.slice(done, done + BATCH);
  const stats: AutomationJobStats = { ...emptyStats(), ...((job.stats as Partial<AutomationJobStats>) ?? {}) };
  // Campos de array podem vir ausentes de um stats parcial antigo.
  stats.errors ??= [];
  stats.flagged ??= [];

  if (batch.length === 0) {
    await finishJob(jobId, stats, job.requested_by as string | null);
    return { done: true, progress: done, total: clinicIds.length };
  }

  await supabase.from("automation_jobs").update({ status: "running" }).eq("id", jobId);

  for (const clinicId of batch) {
    try {
      const res = await scanClinic(clinicId, job.apply_empty === true);
      if ("error" in res) {
        stats.errors.push(res.error);
        continue;
      }
      stats.detected += 1;
      stats.applied += res.filled;
      if (res.missing > 0 || res.conflicts > 0) {
        stats.incomplete += 1;
        stats.flagged.push({
          clinicId,
          clinicName: res.clinicName,
          missing: res.missing,
          conflicts: res.conflicts,
        });
      }
    } catch (e) {
      stats.errors.push(
        `${clinicId.slice(0, 8)}: ${e instanceof Error ? e.message : "falha inesperada"}`,
      );
    }
  }

  const progress = done + batch.length;
  const finished = progress >= clinicIds.length;
  await supabase
    .from("automation_jobs")
    .update({ progress_done: progress, stats, status: finished ? "done" : "running" })
    .eq("id", jobId);

  if (finished) await notifyIfAutomatic(stats, job.requested_by as string | null);

  return { done: finished, progress, total: clinicIds.length };
}

async function finishJob(
  jobId: string,
  stats: AutomationJobStats,
  requestedBy: string | null,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("automation_jobs").update({ status: "done", stats }).eq("id", jobId);
  await notifyIfAutomatic(stats, requestedBy);
}

/**
 * A varredura automática (semanal) não tem quem pediu — `requested_by` nulo é o
 * sinal. Nesse caso os gestores recebem notificação in-app com o que precisa de
 * atenção; a varredura manual não notifica (quem clicou já está olhando a tela).
 *
 * dedupe_key por semana ISO: a mesma pendência não vira aviso novo todo dia se
 * a varredura for disparada mais de uma vez.
 */
async function notifyIfAutomatic(
  stats: AutomationJobStats,
  requestedBy: string | null,
): Promise<void> {
  if (requestedBy !== null) return;
  const flagged = stats.flagged ?? [];
  if (flagged.length === 0 && (stats.errors?.length ?? 0) === 0) return;

  const supabase = createServiceClient();
  const { data: gestores } = await supabase
    .from("app_users")
    .select("id")
    .eq("role", "gestor")
    .eq("active", true);
  if (!gestores || gestores.length === 0) return;

  const week = isoWeekKey(new Date());
  const names = flagged.slice(0, 4).map((f) => f.clinicName);
  const extra = flagged.length > names.length ? ` e +${flagged.length - names.length}` : "";
  const body =
    flagged.length > 0
      ? `${names.join(", ")}${extra} com configuração incompleta ou incoerente com o funil.`
      : `${stats.errors.length} clínica(s) falharam na varredura.`;

  await createNotifications(
    gestores.map((g) => ({
      recipientId: g.id as string,
      type: "automation_warning" as const,
      title: "Automação de agendamento precisa de atenção",
      body,
      url: "/configuracoes/automacao",
      dedupeKey: `automation_warning:${g.id}:${week}`,
    })),
  );
}

/** Chave ano-semana ISO (ex.: "2026-W31") para deduplicar o aviso semanal. */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Quinta-feira da mesma semana define o ano ISO.
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Cria o job da varredura AUTOMÁTICA (sem dono) para toda a carteira com painel
 * vinculado. Chamado pelo endpoint do cron semanal.
 */
export async function createAutomaticScanJob(): Promise<
  { ok: true; jobId: string; total: number } | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data: clinics, error } = await supabase
    .from("clinics")
    .select("id")
    .neq("contract_status", "archived");
  if (error) return { ok: false, error: error.message };

  const ids = (clinics ?? []).map((c) => c.id as string);
  if (ids.length === 0) return { ok: false, error: "Nenhuma clínica ativa" };

  const { data: integrations } = await supabase
    .from("clinic_integrations")
    .select("clinic_id, panel_id")
    .in("clinic_id", ids);
  const scoped = (integrations ?? []).filter((i) => i.panel_id).map((i) => i.clinic_id as string);
  if (scoped.length === 0) return { ok: false, error: "Nenhuma clínica com painel vinculado" };

  const { data: job, error: insErr } = await supabase
    .from("automation_jobs")
    .insert({
      requested_by: null, // marca a varredura como automática → notifica gestores
      clinic_ids: scoped,
      progress_total: scoped.length,
      apply_empty: true,
      status: "queued",
    })
    .select("id")
    .single();
  if (insErr || !job) return { ok: false, error: insErr?.message ?? "Falha ao criar job" };

  return { ok: true, jobId: job.id as string, total: scoped.length };
}

export type { AutomationConfig };
