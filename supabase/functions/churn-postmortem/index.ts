// Edge Function: post-mortem de churn por IA.
//
// Lê a conversa do grupo de WhatsApp da clínica desligada nos últimos N dias e
// devolve o que deu errado: motivos prováveis com evidência, sinais que já
// apareciam antes e trechos citados. Grava em churn_analyses (0069).
//
// Por que aqui e não no Next: a chave do LLM (DEEPSEEK_API_KEY) só existe nos
// secrets do Supabase — mesmo motivo do summarize-groups. O Next dispara esta
// função logo após registrar o churn (fire-and-forget) e a UI lê a tabela.
//
// Diferença para o summarize-groups: lá o recorte é UM DIA e o objetivo é
// operacional (o que fazer hoje). Aqui a janela é de meses e o objetivo é
// retrospectivo, então o transcript leva a data em cada linha — sem isso o
// modelo não consegue dizer "isto começou em maio".
//
// Secrets: CRON_SECRET, DEEPSEEK_API_KEY. Opcionais: LLM_MODEL, LLM_BASE_URL.
//
// Chamada: POST com header x-cron-secret e body {"churnId": "<uuid>"}
//   ?windowDays=120 (default) · ?preview=1 devolve sem gravar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
// Teto do transcript. Acima disso o custo cresce sem melhorar a conclusão —
// e o que importa num post-mortem é o fim do relacionamento, que fica preservado
// porque o corte remove as mensagens MAIS ANTIGAS.
const MAX_TRANSCRIPT_CHARS = 45_000;
const DEFAULT_WINDOW_DAYS = 120;

const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const API_KEY = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
const MODEL_FALLBACK = (Deno.env.get("LLM_MODEL") ?? "deepseek-chat").trim();
const BASE_URL = (Deno.env.get("LLM_BASE_URL") ?? "https://api.deepseek.com")
  .trim()
  .replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type TeamEntry = { lid: string; name: string | null; kind: "human" | "bot" };
type Msg = {
  event_ts: string;
  participant: string | null;
  push_name: string | null;
  from_me: boolean;
  text: string | null;
};

/** Mesma lógica de rótulo do summarize-groups: equipe/bot pelo cadastro. */
function senderLabel(m: Msg, teamByLid: Map<string, TeamEntry>): string {
  if (m.from_me || m.participant === "Você") return "Equipe (conta conectada)";
  const entry = m.participant ? teamByLid.get(m.participant) : undefined;
  if (entry) return entry.kind === "bot" ? `Bot (${entry.name ?? "IA"})` : `${entry.name ?? "Equipe"} [equipe]`;
  const pn = m.push_name;
  if (pn && !/^\d+$/.test(pn)) return pn;
  return `Cliente (…${(m.participant ?? "?").slice(-4)})`;
}

/**
 * Transcript com DATA em cada linha, cortando pelo começo quando estoura.
 * Percorre de trás para frente de propósito: o fim do relacionamento é o que
 * explica o churn; o início é o que se pode perder sem prejuízo.
 */
function buildTranscript(messages: Msg[], teamByLid: Map<string, TeamEntry>) {
  const lines: string[] = [];
  let total = 0;
  let truncated = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.text) continue;
    const stamp = new Date(m.event_ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const line = `[${stamp}] ${senderLabel(m, teamByLid)}: ${m.text}`;
    if (total + line.length > MAX_TRANSCRIPT_CHARS) {
      truncated = true;
      break;
    }
    lines.push(line);
    total += line.length + 1;
  }
  lines.reverse(); // volta à ordem cronológica para o modelo ler a evolução
  return { transcript: lines.join("\n"), used: lines.length, truncated };
}

const OUTPUT_SCHEMA = `Responda SOMENTE com JSON válido neste formato:
{
  "summary": "2 a 4 frases explicando o que levou ao desligamento, em português",
  "reasons": [
    { "motivo": "frase curta", "confianca": "alta|media|baixa", "evidencia": "por que você concluiu isso" }
  ],
  "signals": [
    { "quando": "DD/MM", "sinal": "o que já indicava o risco naquele momento" }
  ],
  "quotes": ["trecho literal do grupo que sustenta a análise"]
}`;

const INSTRUCTIONS = `Você analisa a conversa de WhatsApp entre a equipe da Contact.IA (agência de marketing/IA para clínicas odontológicas) e uma clínica que acabou de CANCELAR o contrato.

Sua tarefa é um post-mortem honesto: o que levou ao cancelamento.

Regras:
- Baseie-se APENAS no que está na conversa. Se a conversa não explica o churn, diga isso claramente em "summary" e devolva poucos motivos com confianca "baixa".
- Não invente reclamação que não foi feita. Ausência de conversa também é achado: silêncio prolongado, perguntas sem resposta e sumiço da clínica são sinais válidos.
- Priorize o que o CLIENTE disse sobre o que a equipe supôs.
- Em "signals", procure o que já apontava o risco ANTES do fim: cobranças repetidas, reclamação de resultado, atraso de resposta nosso, troca de interlocutor, tom esfriando.
- Em "quotes", copie frases literais (máximo 5), preferindo as do cliente.
- Seja específico: "reclamou 3x que os leads não compareciam" vale mais que "insatisfação com resultados".`;

function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!API_KEY) {
    return Response.json({ ok: false, error: "DEEPSEEK_API_KEY ausente" }, { status: 500 });
  }

  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";
  const windowDays = Number(url.searchParams.get("windowDays")) || DEFAULT_WINDOW_DAYS;

  let body: { churnId?: string } = {};
  try {
    body = await req.json();
  } catch { /* body opcional */ }
  const churnId = body.churnId;
  if (!churnId) return Response.json({ ok: false, error: "churnId obrigatório" }, { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: churn } = await supabase
    .from("clinic_churns")
    .select("id, clinic_id, churn_month, reason, notes, clinics(name)")
    .eq("id", churnId)
    .maybeSingle();
  if (!churn) return Response.json({ ok: false, error: "churn não encontrado" }, { status: 404 });

  const clinicRel = churn.clinics as { name: string } | { name: string }[] | null;
  const clinicName = (Array.isArray(clinicRel) ? clinicRel[0]?.name : clinicRel?.name) ?? "a clínica";
  const clinicId = churn.clinic_id as string;

  // Marca "rodando" antes de começar: a UI mostra o estado e uma falha no meio
  // não deixa a linha fantasma. Upsert porque "Analisar de novo" reusa a linha.
  if (!preview) {
    await supabase
      .from("churn_analyses")
      .upsert(
        {
          churn_id: churnId,
          clinic_id: clinicId,
          status: "rodando",
          window_days: windowDays,
          error: null,
        },
        { onConflict: "churn_id" },
      );
  }

  try {
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

    // O vínculo mensagem→clínica é pelo GRUPO, não pela coluna clinic_id de
    // whatsapp_group_messages: ela existe mas nunca é preenchida pela coleta
    // (nula nas 13k linhas em 2026-07-28). Quem sabe de quem é o grupo é
    // whatsapp_groups.clinic_id, mapeado à mão em Configurações › WhatsApp.
    const { data: groups } = await supabase
      .from("whatsapp_groups")
      .select("group_jid")
      .eq("clinic_id", clinicId);
    const jids = (groups ?? []).map((g) => g.group_jid as string);

    if (jids.length === 0) {
      const result = {
        status: "concluido" as const,
        summary:
          "Nenhum grupo de WhatsApp está mapeado para esta clínica, então não há conversa para analisar. " +
          "Mapeie o grupo em Configurações › WhatsApp e rode a análise de novo.",
        reasons: [],
        signals: [],
        quotes: [],
        messages_used: 0,
        truncated: false,
        model: null,
      };
      if (!preview) await supabase.from("churn_analyses").update(result).eq("churn_id", churnId);
      return Response.json({ ok: true, ...result, clinic: clinicName });
    }

    const [{ data: msgs }, { data: team }] = await Promise.all([
      supabase
        .from("whatsapp_group_messages")
        .select("event_ts, participant, push_name, from_me, text")
        .in("group_jid", jids)
        .gte("event_ts", since)
        .order("event_ts", { ascending: true })
        .limit(4000),
      supabase.from("whatsapp_team_members").select("lid, name, kind").not("lid", "is", null),
    ]);

    const messages = (msgs ?? []) as Msg[];
    const teamByLid = new Map<string, TeamEntry>(
      (team ?? []).map((t) => [t.lid as string, t as TeamEntry]),
    );

    // Sem conversa não há o que analisar — e é melhor dizer isso do que deixar
    // o modelo alucinar motivo a partir de nada.
    if (messages.filter((m) => m.text).length < 5) {
      const result = {
        status: "concluido" as const,
        summary:
          `Não há conversa suficiente no grupo desta clínica nos últimos ${windowDays} dias para explicar o desligamento ` +
          `(${messages.length} mensagem(ns) coletada(s)). Verifique se o grupo está mapeado em Configurações › WhatsApp.`,
        reasons: [],
        signals: [],
        quotes: [],
        messages_used: messages.length,
        truncated: false,
        model: null,
      };
      if (!preview) {
        await supabase.from("churn_analyses").update(result).eq("churn_id", churnId);
      }
      return Response.json({ ok: true, ...result, clinic: clinicName });
    }

    const { transcript, used, truncated } = buildTranscript(messages, teamByLid);

    const { data: aiCfg } = await supabase
      .from("ai_settings")
      .select("model, temperature, max_tokens")
      .eq("id", true)
      .maybeSingle();
    const model = (aiCfg?.model as string | null)?.trim() || MODEL_FALLBACK;

    const mesLabel = String(churn.churn_month).split("-").reverse().join("/");
    const prompt = [
      INSTRUCTIONS,
      ``,
      `Clínica: "${clinicName}". Mês do desligamento: ${mesLabel}.`,
      churn.reason ? `Motivo registrado manualmente pelo gestor: "${churn.reason}".` : "",
      churn.notes ? `Observações do gestor: "${churn.notes}".` : "",
      `O motivo registrado é um palpite de lista fechada — confirme, refine ou contradiga com base na conversa.`,
      ``,
      `Mensagens marcadas com [equipe], "Bot" ou "Equipe (conta conectada)" são do nosso lado; as demais são da clínica.`,
      truncated ? `ATENÇÃO: o início da janela foi cortado por volume; você está vendo o período mais recente.` : "",
      ``,
      OUTPUT_SCHEMA,
      ``,
      `CONVERSA (${used} mensagens, últimos ${windowDays} dias):`,
      transcript,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: aiCfg?.temperature != null ? Number(aiCfg.temperature) : 0.3,
        // Alto de propósito — ver 0077: com modelo de raciocínio o teto é
        // gasto pensando e o corte devolve `content` vazio.
        max_tokens: aiCfg?.max_tokens != null ? Number(aiCfg.max_tokens) : 8000,
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const parsed = parseJson(j?.choices?.[0]?.message?.content ?? "");
    if (!parsed) throw new Error("resposta do modelo não é o JSON esperado");

    const result = {
      status: "concluido" as const,
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      messages_used: used,
      truncated,
      model,
      error: null,
    };
    if (!preview) {
      await supabase.from("churn_analyses").update(result).eq("churn_id", churnId);
    }
    return Response.json({ ok: true, clinic: clinicName, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "falha na análise";
    if (!preview) {
      await supabase
        .from("churn_analyses")
        .update({ status: "erro", error: message.slice(0, 500) })
        .eq("churn_id", churnId);
    }
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
});
