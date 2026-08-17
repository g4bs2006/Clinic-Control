// Edge Function: resumo diário por IA (DeepSeek) das conversas dos grupos.
// Roda via pg_cron após a coleta (collect-groups). Lê as mensagens do dia de
// cada clínica mapeada e grava um resumo em whatsapp_daily_summaries.
//
// Config da IA (instruções/modelo/temperatura/max_tokens) vem da tabela
// ai_settings (editável na plataforma, sem redeploy); cai nos defaults se ausente.
//
// Secrets: CRON_SECRET (compartilhado com collect-groups), DEEPSEEK_API_KEY.
//   Opcionais: LLM_MODEL, LLM_BASE_URL (fallback quando ai_settings não define).
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET>
//   ?date=YYYY-MM-DD (default: hoje no fuso America/Sao_Paulo)
//   ?force=1 re-gera resumos já existentes do dia.
//   ?preview=1&clinic=<id> → só devolve o resultado do dia p/ 1 clínica, SEM gravar.
//   ?clinics=<id,id,...> → restringe a execução a essas clínicas (geração
//     on-demand da página de tarefas, que manda só as da carteira ativa).

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
const MODEL_FALLBACK = (Deno.env.get("LLM_MODEL") ?? "deepseek-chat").trim();
const BASE_URL = (Deno.env.get("LLM_BASE_URL") ?? "https://api.deepseek.com")
  .trim()
  .replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface LlmConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

interface LlmResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

async function callLlm(prompt: string, cfg: LlmConfig): Promise<LlmResult> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
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
  const preview = url.searchParams.get("preview") === "1";
  const clinicsParam = (url.searchParams.get("clinics") ?? "").trim();
  const onlyClinics = clinicsParam
    ? new Set(clinicsParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  // O dia CORRENTE sempre re-gera (upsert) — a conversa ainda está acontecendo;
  // dias passados só com ?force=1.
  const force = url.searchParams.get("force") === "1" || date === todaySaoPaulo();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Config da IA (editável na plataforma).
  const { data: aiCfg } = await supabase
    .from("ai_settings")
    .select("summary_instructions, model, temperature, max_tokens")
    .eq("id", true)
    .maybeSingle();
  const cfg: LlmConfig = {
    model: (aiCfg?.model as string | null)?.trim() || MODEL_FALLBACK,
    temperature: aiCfg?.temperature != null ? Number(aiCfg.temperature) : 0.3,
    // Default alto de propósito: com modelo de raciocínio (deepseek-v4-pro), o
    // teto é consumido PENSANDO e o corte deixa `content` vazio — o antigo
    // 1200 fazia a API responder 200 com resposta vazia. Teto não é consumo.
    maxTokens: aiCfg?.max_tokens != null ? Number(aiCfg.max_tokens) : 8000,
  };
  const instructions = (aiCfg?.summary_instructions as string | null)?.trim() || undefined;

  // Janela do dia no fuso de SP (UTC-3, sem horário de verão desde 2019).
  const dayStart = `${date}T00:00:00-03:00`;
  const dayEnd = `${date}T23:59:59.999-03:00`;
  const dateLabel = date.split("-").reverse().join("/");

  const { data: team } = await supabase
    .from("whatsapp_team_members")
    .select("lid, name, kind")
    .not("lid", "is", null);
  const teamByLid = new Map<string, TeamEntry>((team ?? []).map((t) => [t.lid as string, t as TeamEntry]));

  // ── Preview: 1 clínica, sem gravar (playground de teste do prompt) ──────────
  if (preview) {
    const clinicId = url.searchParams.get("clinic");
    if (!clinicId) return Response.json({ ok: false, error: "parâmetro 'clinic' obrigatório" });
    const { data: groups } = await supabase
      .from("whatsapp_groups")
      .select("group_jid")
      .eq("clinic_id", clinicId);
    const jids = (groups ?? []).map((g) => g.group_jid as string);
    if (!jids.length) return Response.json({ ok: false, error: "Clínica sem grupo de WhatsApp mapeado." });
    const { data: msgs } = await supabase
      .from("whatsapp_group_messages")
      .select("event_ts, participant, push_name, from_me, text")
      .in("group_jid", jids)
      .gte("event_ts", dayStart)
      .lte("event_ts", dayEnd)
      .not("text", "is", null)
      .order("event_ts");
    const messages = (msgs ?? []) as TranscriptMessage[];
    if (messages.length < MIN_MESSAGES) {
      return Response.json({ ok: false, error: "Poucas mensagens nesse dia para gerar resumo." });
    }
    const { transcript } = buildTranscript(messages, teamByLid);
    const { data: clinicRow } = await supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle();
    const prompt = buildPrompt(
      (clinicRow?.name as string) ?? "clínica",
      dateLabel,
      transcript,
      undefined,
      instructions,
    );
    try {
      const llm = await callLlm(prompt, cfg);
      const parsed = parseModelSummary(llm.content);
      return Response.json({
        ok: !!parsed,
        model: cfg.model,
        date,
        resumo_md: parsed?.resumo_md ?? null,
        highlights: parsed?.highlights ?? null,
        error: parsed ? undefined : "resposta do modelo não é o JSON esperado",
        // Quando o parse falha, devolve o texto cru: sem isso a falha é uma
        // caixa-preta (foi o que escondeu, desde 2026-08-03, o motivo real de
        // várias clínicas não gerarem resumo). Só no preview, que não grava.
        raw: parsed ? undefined : llm.content.slice(0, 1200),
        rawLength: parsed ? undefined : llm.content.length,
        completionTokens: parsed ? undefined : llm.completionTokens,
      });
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message });
    }
  }

  const yesterdayDate = new Date(`${date}T00:00:00-03:00`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  const [{ data: groups }, { data: existing }, { data: yesterday }] = await Promise.all([
    supabase.from("whatsapp_groups").select("group_jid, clinic_id").not("clinic_id", "is", null),
    force
      ? Promise.resolve({ data: [] as { clinic_id: string }[] })
      : supabase.from("whatsapp_daily_summaries").select("clinic_id").eq("summary_date", date),
    supabase.from("whatsapp_daily_summaries").select("clinic_id, highlights").eq("summary_date", yesterdayStr),
  ]);

  const done = new Set((existing ?? []).map((e) => e.clinic_id as string));
  const yesterdayByClinic = new Map<string, YesterdayDigest>(
    (yesterday ?? []).map((y) => [y.clinic_id as string, (y.highlights ?? {}) as YesterdayDigest]),
  );

  // grupos por clínica (uma clínica pode ter mais de um grupo)
  const groupsByClinic = new Map<string, string[]>();
  for (const g of groups ?? []) {
    const cid = g.clinic_id as string;
    if (done.has(cid)) continue;
    if (onlyClinics && !onlyClinics.has(cid)) continue;
    const arr = groupsByClinic.get(cid) ?? [];
    arr.push(g.group_jid as string);
    groupsByClinic.set(cid, arr);
  }

  const { data: clinicNames } = await supabase.from("clinics").select("id, name");
  const nameById = new Map((clinicNames ?? []).map((c) => [c.id as string, c.name as string]));

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
          const llm = await callLlm(
            buildPrompt(clinicName, dateLabel, transcript, yesterdayDigest || undefined, instructions),
            cfg,
          );
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
                model: cfg.model,
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
            model: cfg.model,
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
    model: cfg.model,
    clinics_considered: clinicIds.length,
    summarized,
    skipped_few_messages: skipped,
    already_done: done.size,
    errors,
  });
});
