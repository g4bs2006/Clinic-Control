"use server";

// Geração on-demand de sugestões de tarefa a partir dos grupos de WhatsApp —
// como JOB em background (padrão dos report_jobs): o clique registra o pedido
// e o usuário segue navegando; ticks curtos em /api/tasks/generate/process
// sincronizam as mensagens e analisam as clínicas em lotes. O pipeline de IA é
// o do resumo diário (summarize-groups + trigger expand_pendencias_to_suggestions),
// então o dedup e o custo em ai_usage_log valem aqui também.

import { headers } from "next/headers";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope, getCurrentProfile } from "@/lib/users/actions";
import { listClinics } from "@/lib/clinics/actions";
import { signSessionToken } from "@/lib/auth/token";
import type { SuggestionJobStats } from "./generate-runner";

export type SuggestionJobRow = {
  id: string;
  status: "queued" | "syncing" | "analyzing" | "done" | "error";
  progress_done: number;
  progress_total: number;
  stats: SuggestionJobStats | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE_STATUSES = ["queued", "syncing", "analyzing"];
// Sem atualização há mais tempo que isso, o job é considerado travado e o
// polling da UI dispara um novo tick (cura re-invocações perdidas).
const STALL_MS = 90_000;

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function triggerTick(jobId: string, origin: string) {
  const sig = await signSessionToken(`suggest:${jobId}`, Date.now() + 10 * 60 * 1000);
  try {
    // Timeout curto: só precisamos despachar a request — o processamento
    // continua no route handler mesmo depois do abort.
    await fetch(`${origin}/api/tasks/generate/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, sig }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // abort esperado ou rede — o auto-kick do polling cobre falhas reais
  }
}

/**
 * Registra um job de geração para as clínicas da carteira ativa que têm grupo
 * mapeado e dispara o primeiro tick. O escopo é resolvido AQUI, no clique —
 * o job carrega a lista de clínicas, então trocar de carteira depois não muda
 * uma análise já em andamento.
 */
export async function startSuggestionGeneration(): Promise<
  | { ok: true; jobId: string; clinicCount: number; unmappedCount: number }
  | { ok: false; error: string }
> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };
  const supabase = createServiceClient();

  const [scope, clinics, profile, { data: groups, error: groupsError }] = await Promise.all([
    getCarteiraScope(),
    listClinics(),
    getCurrentProfile(),
    supabase.from("whatsapp_groups").select("clinic_id").not("clinic_id", "is", null),
  ]);
  if (groupsError) return { ok: false, error: groupsError.message };

  const mapped = new Set((groups ?? []).map((g) => g.clinic_id as string));
  const inScope = clinics.filter(
    (c) =>
      c.contract_status !== "archived" &&
      (!scope.developerFilter || c.developer_id === scope.developerFilter),
  );
  const targets = inScope.filter((c) => mapped.has(c.id)).map((c) => c.id);
  if (!targets.length) {
    return { ok: false, error: "Nenhuma clínica da carteira ativa tem grupo de WhatsApp mapeado" };
  }

  const { data: active } = await supabase
    .from("suggestion_jobs")
    .select("id")
    .eq("requested_by", profile?.id ?? "")
    .in("status", ACTIVE_STATUSES)
    .limit(1);
  if (active?.length) {
    return { ok: false, error: "Você já tem uma análise em andamento" };
  }

  const { data, error } = await supabase
    .from("suggestion_jobs")
    .insert({
      requested_by: profile?.id ?? null,
      clinic_ids: targets,
      progress_total: targets.length,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const jobId = data.id as string;
  const origin = await requestOrigin();
  after(() => triggerTick(jobId, origin));

  return { ok: true, jobId, clinicCount: targets.length, unmappedCount: inScope.length - targets.length };
}

/**
 * Jobs recentes do usuário logado (mais novos primeiro). Também "cura" jobs
 * travados: ativo sem atualização há mais de STALL_MS re-dispara o tick.
 */
export async function listSuggestionJobs(): Promise<SuggestionJobRow[]> {
  if (!(await getSessionUser())) return [];
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("suggestion_jobs")
    .select("id, status, progress_done, progress_total, stats, error, created_at, updated_at")
    .eq("requested_by", profile.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const jobs = (data ?? []) as SuggestionJobRow[];

  const stalled = jobs.filter(
    (j) => ACTIVE_STATUSES.includes(j.status) && Date.now() - Date.parse(j.updated_at) > STALL_MS,
  );
  if (stalled.length) {
    const origin = await requestOrigin();
    after(async () => {
      for (const j of stalled) await triggerTick(j.id, origin);
    });
  }

  return jobs;
}
