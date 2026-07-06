import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/crypto/token";
import {
  listSessionsRaw,
  listSessionMessages,
  getContactRaw,
  listChannels,
} from "@/lib/helena/client";
import {
  analyzeConversation,
  dedupeByContact,
  buildStats,
  type RawSession,
  type RawMessage,
  type RawContact,
  type ConversationRow,
} from "./analysis";
import { DEFAULT_KEYWORDS, KEYWORD_STAGES, type ReportKeywords } from "./keywords";
import { buildReportXlsx } from "./xlsx";

// Quantas sessões coletar por tick — mantém cada invocação bem abaixo do
// limite de tempo da function; o restante fica para o próximo tick.
const BATCH_SIZE = 40;
const FETCH_CONCURRENCY = 6;

export type TickResult =
  | { done: false; status: string; progressDone: number; progressTotal: number }
  | { done: true; status: "done" | "error"; error?: string };

type JobRow = {
  id: string;
  clinic_id: string;
  date_start: string;
  date_end: string;
  status: string;
};

type StagedPayload = {
  session: RawSession;
  messages: RawMessage[];
  contact: RawContact | null;
  canalNome: string;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadKeywords(): Promise<{ kw: ReportKeywords; custom: boolean }> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("report_keywords").select("stage, terms");
  const rows = (data ?? []) as { stage: string; terms: string[] }[];
  if (!rows.length) return { kw: DEFAULT_KEYWORDS, custom: false };
  const kw = { ...DEFAULT_KEYWORDS };
  let custom = false;
  for (const row of rows) {
    if ((KEYWORD_STAGES as readonly string[]).includes(row.stage) && row.terms?.length) {
      const stage = row.stage as keyof ReportKeywords;
      if (JSON.stringify(kw[stage]) !== JSON.stringify(row.terms)) custom = true;
      kw[stage] = row.terms;
    }
  }
  return { kw, custom };
}

async function failJob(jobId: string, message: string): Promise<TickResult> {
  const supabase = createServiceClient();
  await supabase
    .from("report_jobs")
    .update({ status: "error", error: message.slice(0, 1000), updated_at: new Date().toISOString() })
    .eq("id", jobId);
  return { done: true, status: "error", error: message };
}

/**
 * Processa um "tick" do job: coleta um lote de sessões (com checkpoint no
 * banco) ou, se a coleta terminou, roda a análise e gera o xlsx. Retorna
 * done=false enquanto houver trabalho — o chamador dispara o próximo tick.
 */
export async function processReportJob(jobId: string): Promise<TickResult> {
  const supabase = createServiceClient();

  const { data: jobData, error: jobError } = await supabase
    .from("report_jobs")
    .select("id, clinic_id, date_start, date_end, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return failJob(jobId, jobError.message);
  const job = jobData as JobRow | null;
  if (!job) return { done: true, status: "error", error: "Job não encontrado" };
  if (job.status === "done") return { done: true, status: "done" };
  if (job.status === "error") return { done: true, status: "error" };

  try {
    // ── Credenciais da clínica ───────────────────────────────────────────
    const { data: integ } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted")
      .eq("clinic_id", job.clinic_id)
      .maybeSingle();
    if (!integ?.helena_token_encrypted) {
      return failJob(jobId, "Clínica sem integração Helena configurada");
    }
    const token = decryptToken(integ.helena_token_encrypted as string);

    // Dias no fuso do Brasil (-03:00), para o período casar com o dia local
    // das conversas e das datas exibidas na planilha.
    const after = `${job.date_start}T00:00:00-03:00`;
    const before = `${job.date_end}T23:59:59-03:00`;

    // ── Lista de sessões do período (fonte da verdade do progresso) ──────
    const sessions = (await listSessionsRaw(token, { after, before })) as unknown as RawSession[];

    // Sessões já em staging para esta clínica+período
    const { data: stagedData } = await supabase
      .from("report_raw_sessions")
      .select("session_id")
      .eq("clinic_id", job.clinic_id)
      .gte("session_created_at", after)
      .lte("session_created_at", before);
    const stagedIds = new Set(((stagedData ?? []) as { session_id: string }[]).map((r) => r.session_id));

    const missing = sessions.filter((s) => !stagedIds.has(s.id));
    const collected = sessions.length - missing.length;

    await supabase
      .from("report_jobs")
      .update({
        status: "collecting",
        progress_total: sessions.length,
        progress_done: collected,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // ── Coleta de um lote ─────────────────────────────────────────────────
    if (missing.length > 0) {
      const channels = await listChannels(token).catch(() => []);
      const canalById = new Map(channels.map((c) => [c.id, `${c.name} [${c.type}]`]));
      const contactCache = new Map<string, RawContact | null>();

      const batch = missing.slice(0, BATCH_SIZE);
      await mapLimit(batch, FETCH_CONCURRENCY, async (session) => {
        const messages = (await listSessionMessages(token, session.id)) as unknown as RawMessage[];
        const cid = session.contactId ?? "";
        let contact: RawContact | null = null;
        if (cid) {
          if (contactCache.has(cid)) contact = contactCache.get(cid)!;
          else {
            contact = (await getContactRaw(token, cid)) as RawContact | null;
            contactCache.set(cid, contact);
          }
        }
        const payload: StagedPayload = {
          session,
          messages,
          contact,
          canalNome: canalById.get(session.channelId ?? "") ?? "?",
        };
        const { error } = await supabase.from("report_raw_sessions").upsert({
          clinic_id: job.clinic_id,
          session_id: session.id,
          session_created_at: session.createdAt,
          payload,
        });
        if (error) throw new Error(`staging: ${error.message}`);
      });

      const progressDone = collected + batch.length;
      await supabase
        .from("report_jobs")
        .update({ progress_done: progressDone, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      if (missing.length > batch.length) {
        return { done: false, status: "collecting", progressDone, progressTotal: sessions.length };
      }
    }

    // ── Análise + planilha ────────────────────────────────────────────────
    await supabase
      .from("report_jobs")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // Staging completo do período (paginado)
    const staged: StagedPayload[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase
        .from("report_raw_sessions")
        .select("payload")
        .eq("clinic_id", job.clinic_id)
        .gte("session_created_at", after)
        .lte("session_created_at", before)
        .order("session_created_at")
        .range(from, from + 499);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { payload: StagedPayload }[];
      staged.push(...rows.map((r) => r.payload));
      if (rows.length < 500) break;
    }

    const { kw, custom } = await loadKeywords();

    const analyzed: ConversationRow[] = staged.map((p) =>
      analyzeConversation(
        {
          session: p.session,
          messages: p.messages ?? [],
          contact: p.contact,
          canalNome: p.canalNome ?? "?",
        },
        kw,
      ),
    );

    const rows = dedupeByContact(analyzed).sort((a, b) =>
      a.criadoEm < b.criadoEm ? -1 : 1,
    );
    const stats = buildStats(rows);

    const { data: clinicData } = await supabase
      .from("clinics")
      .select("name")
      .eq("id", job.clinic_id)
      .maybeSingle();
    const clinicName = (clinicData?.name as string | undefined) ?? "Clínica";

    const xlsx = await buildReportXlsx({
      clinicName,
      dateStart: job.date_start,
      dateEnd: job.date_end,
      rows,
      stats,
      usesDefaultKeywords: !custom,
    });

    const filePath = `${job.clinic_id}/${jobId}.xlsx`;
    const { error: uploadError } = await supabase.storage
      .from("reports")
      .upload(filePath, xlsx, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadError) throw new Error(`upload: ${uploadError.message}`);

    await supabase
      .from("report_jobs")
      .update({
        status: "done",
        file_path: filePath,
        stats,
        progress_done: sessions.length,
        progress_total: sessions.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return { done: true, status: "done" };
  } catch (e) {
    return failJob(jobId, e instanceof Error ? e.message : String(e));
  }
}
