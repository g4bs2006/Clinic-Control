import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Quantas clínicas analisar por tick — igual à CONCURRENCY da Edge Function
// summarize-groups: cada tick resolve em ~1 rodada de LLM, bem abaixo do
// limite de tempo da function. Re-tick duplicado é inofensivo (upsert do
// resumo + dedup das sugestões), só desperdiça uma chamada.
const BATCH_SIZE = 3;

export type SuggestionTickResult =
  | { done: false; status: string; progressDone: number; progressTotal: number }
  | { done: true; status: "done" | "error"; error?: string };

export type SuggestionJobStats = {
  summarized: number;
  skipped: number;
  created: number | null;
  sync_warning: string | null;
  errors: string[];
};

type JobRow = {
  id: string;
  clinic_ids: string[];
  status: string;
  progress_done: number;
  pending_before: number | null;
  stats: SuggestionJobStats | null;
};

const EMPTY_STATS: SuggestionJobStats = {
  summarized: 0,
  skipped: 0,
  created: null,
  sync_warning: null,
  errors: [],
};

function edgeConfig(): { base: string; secret: string } | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  return base && secret ? { base, secret } : null;
}

/** Sugestões pendentes das clínicas do job (antes × depois = quantas nasceram). */
async function countPending(clinicIds: string[]): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("task_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .in("clinic_id", clinicIds);
  return count ?? 0;
}

async function failJob(jobId: string, message: string): Promise<SuggestionTickResult> {
  const supabase = createServiceClient();
  await supabase
    .from("suggestion_jobs")
    .update({ status: "error", error: message.slice(0, 1000), updated_at: new Date().toISOString() })
    .eq("id", jobId);
  return { done: true, status: "error", error: message };
}

/**
 * Processa um tick do job de geração: no primeiro tick sincroniza as mensagens
 * dos grupos (collect-groups); nos seguintes analisa BATCH_SIZE clínicas
 * (summarize-groups?clinics= — o trigger do banco converte as tarefas do
 * resumo em sugestões, com dedup). Checkpoint = progress_done no banco.
 */
export async function processSuggestionJob(jobId: string): Promise<SuggestionTickResult> {
  const supabase = createServiceClient();

  const { data: jobData, error: jobError } = await supabase
    .from("suggestion_jobs")
    .select("id, clinic_ids, status, progress_done, pending_before, stats")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return failJob(jobId, jobError.message);
  const job = jobData as JobRow | null;
  if (!job) return { done: true, status: "error", error: "Job não encontrado" };
  if (job.status === "done") return { done: true, status: "done" };
  if (job.status === "error") return { done: true, status: "error" };

  const cfg = edgeConfig();
  if (!cfg) return failJob(jobId, "Config ausente (NEXT_PUBLIC_SUPABASE_URL / COLLECT_GROUPS_CRON_SECRET)");

  const total = job.clinic_ids.length;
  const stats: SuggestionJobStats = { ...EMPTY_STATS, ...(job.stats ?? {}) };

  try {
    // ── Tick 1: coleta ao vivo das mensagens (tolera falha → aviso) ────────
    if (job.status === "queued") {
      const pendingBefore = await countPending(job.clinic_ids);
      await supabase
        .from("suggestion_jobs")
        .update({
          status: "syncing",
          pending_before: pendingBefore,
          progress_total: total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      try {
        const res = await fetch(`${cfg.base}/functions/v1/collect-groups?lookbackHours=24`, {
          method: "POST",
          headers: { "x-cron-secret": cfg.secret },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          stats.sync_warning = json?.error ?? `coleta falhou (HTTP ${res.status})`;
        }
      } catch (e) {
        stats.sync_warning = e instanceof Error ? e.message : "coleta indisponível";
      }

      await supabase
        .from("suggestion_jobs")
        .update({ status: "analyzing", stats, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return { done: false, status: "analyzing", progressDone: 0, progressTotal: total };
    }

    // ── Ticks seguintes: analisa o próximo lote de clínicas ────────────────
    const batch = job.clinic_ids.slice(job.progress_done, job.progress_done + BATCH_SIZE);
    if (batch.length > 0) {
      const url = `${cfg.base}/functions/v1/summarize-groups?clinics=${encodeURIComponent(batch.join(","))}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-cron-secret": cfg.secret, "content-type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `análise falhou (HTTP ${res.status})`);
      stats.summarized += json?.summarized ?? 0;
      stats.skipped += json?.skipped_few_messages ?? 0;
      if (Array.isArray(json?.errors)) stats.errors.push(...json.errors);

      const progressDone = job.progress_done + batch.length;
      await supabase
        .from("suggestion_jobs")
        .update({ progress_done: progressDone, stats, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      if (progressDone < total) {
        return { done: false, status: "analyzing", progressDone, progressTotal: total };
      }
    }

    // ── Fim: conta quantas sugestões novas nasceram ────────────────────────
    const pendingAfter = await countPending(job.clinic_ids);
    stats.created = Math.max(0, pendingAfter - (job.pending_before ?? pendingAfter));
    await supabase
      .from("suggestion_jobs")
      .update({ status: "done", stats, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return { done: true, status: "done" };
  } catch (e) {
    return failJob(jobId, e instanceof Error ? e.message : String(e));
  }
}
