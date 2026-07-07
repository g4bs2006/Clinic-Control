// Edge Function: resumo diário por IA (DeepSeek) das conversas dos grupos.
// Roda via pg_cron após a coleta (collect-groups). Lê as mensagens do dia de
// cada clínica mapeada e grava um resumo em whatsapp_daily_summaries.
//
// Secrets: CRON_SECRET (compartilhado com collect-groups), DEEPSEEK_API_KEY.
//   Opcionais: LLM_MODEL (default deepseek-chat), LLM_BASE_URL (default
//   https://api.deepseek.com) — a API é compatível com o formato OpenAI,
//   então trocar de provedor é só trocar esses três secrets.
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET>
//   ?date=YYYY-MM-DD (default: hoje no fuso America/Sao_Paulo)
//   ?force=1 re-gera resumos já existentes do dia.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPrompt,
  buildTranscript,
  buildYesterdayDigest,
  parseModelSummary,
  type TeamEntry,
  type TranscriptMessage,
  type YesterdayDigest,
} from "./summarize.ts";

const SCHEMA = "clinic_control";
const CONCURRENCY = 3;
const MIN_MESSAGES = 2; // menos que isso não rende resumo

const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const API_KEY = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
const MODEL = (Deno.env.get("LLM_MODEL") ?? "deepseek-chat").trim();
const BASE_URL = (Deno.env.get("LLM_BASE_URL") ?? "https://api.deepseek.com")
  .trim()
  .replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

interface LlmResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

async function callLlm(prompt: string): Promise<LlmResult> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return {
    content: j?.choices?.[0]?.message?.content ?? "",
    promptTokens: j?.usage?.prompt_tokens ?? 0,
    completionTokens: j?.usage?.completion_tokens ?? 0,
  };
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!API_KEY) {
    return Response.json({ ok: false, error: "DEEPSEEK_API_KEY ausente" }, { status: 500 });
  }

  const url = new URL(req.url);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "")
    ? url.searchParams.get("date")!
    : todaySaoPaulo();
  // O dia CORRENTE sempre re-gera (upsert) — a conversa ainda está acontecendo;
  // dias passados só com ?force=1.
  const force = url.searchParams.get("force") === "1" || date === todaySaoPaulo();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Janela do dia no fuso de SP (UTC-3, sem horário de verão desde 2019).
  const dayStart = `${date}T00:00:00-03:00`;
  const dayEnd = `${date}T23:59:59.999-03:00`;

  const yesterdayDate = new Date(`${date}T00:00:00-03:00`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  const [{ data: groups }, { data: team }, { data: existing }, { data: yesterday }] = await Promise.all([
    supabase.from("whatsapp_groups").select("group_jid, clinic_id").not("clinic_id", "is", null),
    supabase.from("whatsapp_team_members").select("lid, name, kind").not("lid", "is", null),
    force
      ? Promise.resolve({ data: [] as { clinic_id: string }[] })
      : supabase.from("whatsapp_daily_summaries").select("clinic_id").eq("summary_date", date),
    supabase.from("whatsapp_daily_summaries").select("clinic_id, highlights").eq("summary_date", yesterdayStr),
  ]);

  const teamByLid = new Map<string, TeamEntry>(
    (team ?? []).map((t) => [t.lid as string, t as TeamEntry]),
  );
  const done = new Set((existing ?? []).map((e) => e.clinic_id as string));
  const yesterdayByClinic = new Map<string, YesterdayDigest>(
    (yesterday ?? []).map((y) => [y.clinic_id as string, (y.highlights ?? {}) as YesterdayDigest]),
  );

  // grupos por clínica (uma clínica pode ter mais de um grupo)
  const groupsByClinic = new Map<string, string[]>();
  for (const g of groups ?? []) {
    const cid = g.clinic_id as string;
    if (done.has(cid)) continue;
    const arr = groupsByClinic.get(cid) ?? [];
    arr.push(g.group_jid as string);
    groupsByClinic.set(cid, arr);
  }

  const { data: clinicNames } = await supabase.from("clinics").select("id, name");
  const nameById = new Map((clinicNames ?? []).map((c) => [c.id as string, c.name as string]));

  const dateLabel = date.split("-").reverse().join("/");
  const clinicIds = [...groupsByClinic.keys()];
  let summarized = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < clinicIds.length; i += CONCURRENCY) {
    const batch = clinicIds.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (clinicId) => {
        try {
          const { data: msgs } = await supabase
            .from("whatsapp_group_messages")
            .select("event_ts, participant, push_name, from_me, text")
            .in("group_jid", groupsByClinic.get(clinicId)!)
            .gte("event_ts", dayStart)
            .lte("event_ts", dayEnd)
            .not("text", "is", null)
            .order("event_ts");

          const messages = (msgs ?? []) as TranscriptMessage[];
          if (messages.length < MIN_MESSAGES) {
            skipped++;
            return;
          }

          const { transcript, used } = buildTranscript(messages, teamByLid);
          const clinicName = nameById.get(clinicId) ?? "clínica";
          const yesterdayDigest = buildYesterdayDigest(yesterdayByClinic.get(clinicId));
          const llm = await callLlm(buildPrompt(clinicName, dateLabel, transcript, yesterdayDigest || undefined));
          const parsed = parseModelSummary(llm.content);
          if (!parsed) throw new Error("resposta do modelo não é o JSON esperado");

          const { data: saved, error } = await supabase
            .from("whatsapp_daily_summaries")
            .upsert(
              {
                clinic_id: clinicId,
                summary_date: date,
                summary_md: parsed.resumo_md,
                highlights: parsed.highlights,
                model: MODEL,
                message_count: used,
                severity: parsed.highlights.severidade,
                prompt_tokens: llm.promptTokens,
                completion_tokens: llm.completionTokens,
              },
              { onConflict: "clinic_id,summary_date" },
            )
            .select("id")
            .single();
          if (error) throw new Error(error.message);

          await supabase.from("ai_usage_log").insert({
            provider: "deepseek",
            model: MODEL,
            purpose: "resumo_diario",
            prompt_tokens: llm.promptTokens,
            completion_tokens: llm.completionTokens,
            clinic_id: clinicId,
            reference_id: saved?.id ?? null,
          });
          summarized++;
        } catch (e) {
          errors.push(`${nameById.get(clinicId) ?? clinicId}: ${(e as Error).message}`);
        }
      }),
    );
  }

  return Response.json({
    ok: errors.length === 0,
    date,
    model: MODEL,
    clinics_considered: clinicIds.length,
    summarized,
    skipped_few_messages: skipped,
    already_done: done.size,
    errors,
  });
});
