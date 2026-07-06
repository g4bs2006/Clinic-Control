"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile } from "@/lib/users/actions";
import { signSessionToken } from "@/lib/auth/token";
import { KEYWORD_STAGES } from "./keywords";
import type { ReportStats } from "./analysis";

export type ReportJobRow = {
  id: string;
  clinic_id: string;
  date_start: string;
  date_end: string;
  status: "queued" | "collecting" | "analyzing" | "done" | "error";
  progress_done: number;
  progress_total: number | null;
  file_path: string | null;
  stats: ReportStats | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE_STATUSES = ["queued", "collecting", "analyzing"];
// Sem atualização há mais tempo que isso, o job é considerado travado e o
// polling da UI dispara um novo tick (cura re-invocações perdidas).
const STALL_MS = 90_000;
const MAX_PERIOD_DAYS = 92;

async function requireClinicAccess(
  clinicId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (profile.role === "gestor") return { ok: true };
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("clinics")
    .select("developer_id")
    .eq("id", clinicId)
    .maybeSingle();
  if (data?.developer_id !== profile.id) {
    return { ok: false, error: "Sem acesso a esta clínica" };
  }
  return { ok: true };
}

async function triggerTick(jobId: string, origin: string) {
  const sig = await signSessionToken(`report:${jobId}`, Date.now() + 10 * 60 * 1000);
  try {
    // Timeout curto: só precisamos despachar a request — o processamento
    // continua no route handler mesmo depois do abort.
    await fetch(`${origin}/api/reports/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, sig }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // abort esperado ou rede — o auto-kick do polling cobre falhas reais
  }
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createReportJob(input: {
  clinicId: string;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;
}): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const access = await requireClinicAccess(input.clinicId);
  if (!access.ok) return access;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateEnd)) {
    return { ok: false, error: "Datas inválidas (use AAAA-MM-DD)" };
  }
  if (input.dateStart > input.dateEnd) {
    return { ok: false, error: "A data inicial deve ser anterior à final" };
  }
  const days =
    (Date.parse(input.dateEnd) - Date.parse(input.dateStart)) / 86_400_000 + 1;
  if (days > MAX_PERIOD_DAYS) {
    return { ok: false, error: `Período máximo de ${MAX_PERIOD_DAYS} dias por relatório` };
  }

  const supabase = createServiceClient();

  const { data: integ } = await supabase
    .from("clinic_integrations")
    .select("helena_token_encrypted")
    .eq("clinic_id", input.clinicId)
    .maybeSingle();
  if (!integ?.helena_token_encrypted) {
    return { ok: false, error: "Clínica sem integração Helena (token) configurada" };
  }

  const { data: active } = await supabase
    .from("report_jobs")
    .select("id")
    .eq("clinic_id", input.clinicId)
    .in("status", ACTIVE_STATUSES)
    .limit(1);
  if (active?.length) {
    return { ok: false, error: "Já existe um relatório em processamento para esta clínica" };
  }

  const profile = await getCurrentProfile();
  const { data, error } = await supabase
    .from("report_jobs")
    .insert({
      clinic_id: input.clinicId,
      date_start: input.dateStart,
      date_end: input.dateEnd,
      requested_by: profile?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const jobId = data.id as string;
  const origin = await requestOrigin();
  after(() => triggerTick(jobId, origin));

  return { ok: true, jobId };
}

/**
 * Jobs da clínica (mais recentes primeiro). Também "cura" jobs travados:
 * se um job ativo está sem atualização há mais de STALL_MS, re-dispara o tick.
 */
export async function listReportJobs(clinicId: string): Promise<ReportJobRow[]> {
  const access = await requireClinicAccess(clinicId);
  if (!access.ok) return [];

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("report_jobs")
    .select(
      "id, clinic_id, date_start, date_end, status, progress_done, progress_total, file_path, stats, error, created_at, updated_at",
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(20);

  const jobs = (data ?? []) as ReportJobRow[];

  const stalled = jobs.filter(
    (j) =>
      ACTIVE_STATUSES.includes(j.status) &&
      Date.now() - Date.parse(j.updated_at) > STALL_MS,
  );
  if (stalled.length) {
    const origin = await requestOrigin();
    after(async () => {
      for (const j of stalled) await triggerTick(j.id, origin);
    });
  }

  return jobs;
}

export async function getReportDownloadUrl(
  jobId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("report_jobs")
    .select("clinic_id, file_path, status")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Relatório não encontrado" };

  const access = await requireClinicAccess(job.clinic_id as string);
  if (!access.ok) return access;
  if (job.status !== "done" || !job.file_path) {
    return { ok: false, error: "Relatório ainda não está pronto" };
  }

  const { data, error } = await supabase.storage
    .from("reports")
    .createSignedUrl(job.file_path as string, 300);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? "Falha ao gerar link" };
  return { ok: true, url: data.signedUrl };
}

// ── Keywords (Configurações) ─────────────────────────────────────────────────

export type ReportKeywordRow = { stage: string; terms: string[] };

export async function listReportKeywords(): Promise<ReportKeywordRow[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("report_keywords")
    .select("stage, terms")
    .order("stage");
  const rows = (data ?? []) as ReportKeywordRow[];
  // Ordena na sequência do funil, não alfabeticamente
  const order = new Map((KEYWORD_STAGES as readonly string[]).map((s, i) => [s, i]));
  return rows.sort((a, b) => (order.get(a.stage) ?? 99) - (order.get(b.stage) ?? 99));
}

export async function updateReportKeywords(
  stage: string,
  terms: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (profile.role !== "gestor") return { ok: false, error: "Apenas gestores podem editar keywords" };
  if (!(KEYWORD_STAGES as readonly string[]).includes(stage)) {
    return { ok: false, error: "Estágio inválido" };
  }
  const clean = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!clean.length) return { ok: false, error: "Informe ao menos um termo" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("report_keywords")
    .upsert({ stage, terms: clean, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
