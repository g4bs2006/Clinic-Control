"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCarteiraScope } from "@/lib/users/actions";
import { getSessionUser } from "@/lib/auth/session";
import { requireGestor } from "@/lib/auth/require-gestor";

// Dias em UTC (bucket da OpenAI — ver 0053/0055). O "mês" aqui é o mês UTC,
// que bate com o dashboard da OpenAI, não com o fuso de SP.
//
// Granularidade: API KEY, não projeto (0055) — cada clínica tem a própria key
// dentro da organização. O custo por key é ESTIMADO (tokens × preço por
// modelo) e calibrado pela Edge Function para a soma diária bater com a
// fatura real da organização.

function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  return {
    start: `${yearMonth}-01`,
    end: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
  };
}

function currentYearMonthUtc(): string {
  return new Date().toISOString().slice(0, 7);
}

export type OpenAiUsageDay = {
  day: string; // YYYY-MM-DD (UTC)
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
};

export type ClinicOpenAiUsage =
  | { ok: true; linked: false }
  | {
      ok: true;
      linked: true;
      apiKeyId: string;
      yearMonth: string;
      days: OpenAiUsageDay[];
      monthCostUsd: number;
      monthInputTokens: number;
      monthOutputTokens: number;
      monthRequests: number;
      yesterdayCostUsd: number;
      /** Média diária dos 7 dias anteriores a ontem (null = sem histórico). */
      avg7CostUsd: number | null;
    }
  | { ok: false; error: string };

type KeyUsageRow = {
  api_key_id: string;
  day: string;
  est_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
};

/** Soma as linhas key×dia×modelo em um mapa por dia. */
function sumByDay(rows: KeyUsageRow[]): Map<string, OpenAiUsageDay> {
  const byDay = new Map<string, OpenAiUsageDay>();
  for (const r of rows) {
    let d = byDay.get(r.day);
    if (!d) {
      d = { day: r.day, costUsd: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
      byDay.set(r.day, d);
    }
    d.costUsd += Number(r.est_cost_usd);
    d.inputTokens += Number(r.input_tokens);
    d.outputTokens += Number(r.output_tokens);
    d.requests += Number(r.requests);
  }
  return byDay;
}

/** Consumo OpenAI da clínica num mês + KPIs de anomalia (ontem vs média 7d). */
export async function getClinicOpenAiUsage(
  clinicId: string,
  yearMonth?: string,
): Promise<ClinicOpenAiUsage> {
  try {
    const supabase = await createClient();
    const { data: clinic } = await supabase
      .from("clinics")
      .select("openai_api_key_id")
      .eq("id", clinicId)
      .maybeSingle();
    const apiKeyId = (clinic?.openai_api_key_id as string | null) ?? null;
    if (!apiKeyId) return { ok: true, linked: false };

    const ym = yearMonth ?? currentYearMonthUtc();
    const { start, end } = monthBounds(ym);
    // Além do mês pedido, os 8 dias anteriores a hoje alimentam ontem/média-7d
    // mesmo quando o usuário está olhando um mês passado.
    const kpiStart = new Date(Date.now() - 9 * 86400_000).toISOString().slice(0, 10);
    const rangeStart = kpiStart < start ? kpiStart : start;
    const rangeEnd = end > kpiStart ? end : new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("openai_key_usage")
      .select("api_key_id, day, est_cost_usd, input_tokens, output_tokens, requests")
      .eq("api_key_id", apiKeyId)
      .gte("day", rangeStart)
      .lt("day", rangeEnd)
      .order("day");
    if (error) return { ok: false, error: error.message };
    const byDay = sumByDay((data ?? []) as KeyUsageRow[]);

    const days = [...byDay.values()]
      .filter((d) => d.day >= start && d.day < end)
      .sort((a, b) => a.day.localeCompare(b.day));

    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const yesterdayCostUsd = byDay.get(yesterday)?.costUsd ?? 0;
    const prev7 = [...byDay.values()].filter((d) => d.day < yesterday && d.day >= kpiStart);
    const avg7CostUsd = prev7.length
      ? prev7.reduce((s, d) => s + d.costUsd, 0) / prev7.length
      : null;

    return {
      ok: true,
      linked: true,
      apiKeyId,
      yearMonth: ym,
      days,
      monthCostUsd: days.reduce((s, d) => s + d.costUsd, 0),
      monthInputTokens: days.reduce((s, d) => s + d.inputTokens, 0),
      monthOutputTokens: days.reduce((s, d) => s + d.outputTokens, 0),
      monthRequests: days.reduce((s, d) => s + d.requests, 0),
      yesterdayCostUsd,
      avg7CostUsd,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao ler consumo OpenAI" };
  }
}

export type AiSpenderRow = {
  clinicId: string;
  name: string;
  costUsd: number;
  prevMonthCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Houve alerta (limite/anomalia) no mês corrente. */
  alerted: boolean;
};

/** Clínicas da carteira ordenadas por gasto OpenAI no mês (maiores primeiro). */
export async function listTopAiSpenders(
  yearMonth?: string,
  devOverride?: string,
): Promise<AiSpenderRow[]> {
  const [supabase, scope] = await Promise.all([createClient(), getCarteiraScope(devOverride)]);

  let clinicsQuery = supabase
    .from("clinics")
    .select("id, name, developer_id, openai_api_key_id")
    .not("openai_api_key_id", "is", null);
  if (scope.developerFilter) clinicsQuery = clinicsQuery.eq("developer_id", scope.developerFilter);
  const { data: clinics } = await clinicsQuery;
  if (!clinics?.length) return [];

  const ym = yearMonth ?? currentYearMonthUtc();
  const { start, end } = monthBounds(ym);
  const [py, pm] = start.split("-").map(Number);
  const prevYm = new Date(Date.UTC(py, pm - 2, 1)).toISOString().slice(0, 7);

  // Agregado mensal via view (openai_key_monthly): somar as linhas cruas
  // key×dia×modelo no app estoura o corte de 1000 linhas do PostgREST e o
  // ranking sai errado — a soma fica no Postgres.
  const keyIds = clinics.map((c) => c.openai_api_key_id as string);
  const [{ data: usage }, { data: alerts }] = await Promise.all([
    supabase
      .from("openai_key_monthly")
      .select("api_key_id, month, est_cost_usd, input_tokens, output_tokens")
      .in("api_key_id", keyIds)
      .in("month", [prevYm, ym]),
    supabase
      .from("openai_usage_alerts")
      .select("api_key_id")
      .in("api_key_id", keyIds)
      .gte("day", start)
      .lt("day", end),
  ]);

  type MonthlyRow = {
    api_key_id: string;
    month: string;
    est_cost_usd: number;
    input_tokens: number;
    output_tokens: number;
  };
  const alertedKeys = new Set((alerts ?? []).map((a) => a.api_key_id as string));
  const rows = clinics.map((c) => {
    const mine = ((usage ?? []) as MonthlyRow[]).filter((u) => u.api_key_id === c.openai_api_key_id);
    const inMonth = mine.find((u) => u.month === ym);
    const inPrev = mine.find((u) => u.month === prevYm);
    return {
      clinicId: c.id as string,
      name: c.name as string,
      costUsd: Number(inMonth?.est_cost_usd ?? 0),
      prevMonthCostUsd: Number(inPrev?.est_cost_usd ?? 0),
      inputTokens: Number(inMonth?.input_tokens ?? 0),
      outputTokens: Number(inMonth?.output_tokens ?? 0),
      alerted: alertedKeys.has(c.openai_api_key_id as string),
    };
  });
  return rows.sort((a, b) => b.costUsd - a.costUsd);
}

export type OpenAiKeyOption = {
  apiKeyId: string;
  name: string;
  /** "sk-proj-****...abcd" — ajuda a conferir visualmente qual key é. */
  redacted: string | null;
  /** Nome da clínica que já usa esta key (para o select sinalizar). */
  linkedToClinic: string | null;
};

/** API keys da organização (cache alimentado pelo cron collect-openai-usage). */
export async function listOpenAiKeys(): Promise<OpenAiKeyOption[]> {
  const supabase = await createClient();
  const [{ data: keys }, { data: linked }] = await Promise.all([
    supabase.from("openai_api_keys").select("api_key_id, name, redacted_value").order("name"),
    supabase.from("clinics").select("name, openai_api_key_id").not("openai_api_key_id", "is", null),
  ]);
  const linkedBy = new Map(
    (linked ?? []).map((c) => [c.openai_api_key_id as string, c.name as string]),
  );
  return (keys ?? []).map((k) => ({
    apiKeyId: k.api_key_id as string,
    name: k.name as string,
    redacted: (k.redacted_value as string | null) ?? null,
    linkedToClinic: linkedBy.get(k.api_key_id as string) ?? null,
  }));
}

/**
 * Sincroniza AGORA o cache de API keys da organização (projetos + keys) via a
 * Edge Function em modo `keysOnly` — sem coletar uso/custo. Serve para uma
 * clínica/chave nova aparecer no select de vínculo sem esperar o cron diário.
 * A Admin Key só enxerga chaves da PRÓPRIA organização; chaves de contas OpenAI
 * de terceiros não são descobríveis por aqui.
 */
export async function syncOpenAiKeys(): Promise<
  { ok: true; keys: number } | { ok: false; error: string }
> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!baseUrl || !secret) {
    return {
      ok: false,
      error: "Sincronização não configurada — falta COLLECT_GROUPS_CRON_SECRET no ambiente.",
    };
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/collect-openai-usage?keysOnly=1`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? `Falha na sincronização (HTTP ${res.status})` };
    }
    revalidatePath("/", "layout");
    return { ok: true, keys: Number(data.apiKeys ?? 0) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao contatar a função de coleta" };
  }
}

/** Vincula/desvincula a API key OpenAI da clínica ("" limpa o vínculo). */
export async function updateClinicOpenAiKey(
  clinicId: string,
  apiKeyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const value = apiKeyId.trim();
  if (value) {
    const { data } = await supabase
      .from("openai_api_keys")
      .select("api_key_id")
      .eq("api_key_id", value)
      .maybeSingle();
    if (!data) return { ok: false, error: "Key desconhecida — rode a coleta para sincronizar" };
  }
  const { error } = await supabase
    .from("clinics")
    .update({ openai_api_key_id: value || null })
    .eq("id", clinicId);
  if (error) return { ok: false, error: error.message };
  // "layout" cobre as sub-rotas das abas (o painel de consumo vive em /ia).
  revalidatePath(`/clinicas/${clinicId}`, "layout");
  revalidatePath("/");
  return { ok: true };
}

export type OrphanKeySpend = {
  apiKeyId: string;
  name: string;
  costUsd: number;
  requests: number;
  lastDay: string;
};

/**
 * Keys com gasto no mês que NÃO estão vinculadas a nenhuma clínica — dinheiro
 * real na fatura que não aparece em lugar nenhum do painel. Inclui keys já
 * deletadas na OpenAI (a coleta cria um stub para elas justamente para que não
 * sumam daqui).
 */
export async function listOrphanKeySpend(yearMonth?: string): Promise<OrphanKeySpend[]> {
  const supabase = await createClient();
  const ym = yearMonth ?? currentYearMonthUtc();

  const [{ data: usage }, { data: linked }, { data: keys }] = await Promise.all([
    supabase
      .from("openai_key_monthly")
      .select("api_key_id, est_cost_usd, requests")
      .eq("month", ym),
    supabase.from("clinics").select("openai_api_key_id").not("openai_api_key_id", "is", null),
    supabase.from("openai_api_keys").select("api_key_id, name"),
  ]);

  const linkedIds = new Set((linked ?? []).map((c) => c.openai_api_key_id as string));
  const nameOf = new Map((keys ?? []).map((k) => [k.api_key_id as string, k.name as string]));

  const orphans = (usage ?? []).filter((u) => !linkedIds.has(u.api_key_id as string));
  if (!orphans.length) return [];

  // Último dia com uso: separa "key ativa que ninguém vinculou" de "key que já
  // morreu" — a ação para cada uma é diferente.
  const { data: lastDays } = await supabase
    .from("openai_key_usage")
    .select("api_key_id, day")
    .in("api_key_id", orphans.map((o) => o.api_key_id as string))
    .order("day", { ascending: false });
  const lastDayOf = new Map<string, string>();
  for (const r of lastDays ?? []) {
    const id = r.api_key_id as string;
    if (!lastDayOf.has(id)) lastDayOf.set(id, r.day as string);
  }

  return orphans
    .map((o) => ({
      apiKeyId: o.api_key_id as string,
      name: nameOf.get(o.api_key_id as string) ?? "(desconhecida)",
      costUsd: Number(o.est_cost_usd ?? 0),
      requests: Number(o.requests ?? 0),
      lastDay: lastDayOf.get(o.api_key_id as string) ?? "",
    }))
    .filter((o) => o.costUsd > 0)
    .sort((a, b) => b.costUsd - a.costUsd);
}

export type ContainmentAction = {
  sessionId: string;
  contactName: string;
  contactPhone: string;
  outcome: "concluida" | "poupada" | "falhou" | "simulada";
  reason: string;
  msgsIa: number;
  msgsPaciente: number;
  dupRatio: number;
  activeHours: number;
  error: string | null;
};

export type ContainmentRun = {
  id: string;
  day: string;
  costUsd: number;
  status: string;
  dryRun: boolean;
  sessionsScanned: number;
  suspectsFound: number;
  sessionsClosed: number;
  error: string | null;
  createdAt: string;
  actions: ContainmentAction[];
};

/** Histórico de contenção da clínica (rodadas + o que foi decidido em cada). */
export async function listClinicContainment(
  clinicId: string,
  limit = 5,
): Promise<ContainmentRun[]> {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("openai_containment_runs")
    .select(
      "id, day, cost_usd, status, dry_run, sessions_scanned, suspects_found, sessions_closed, error, created_at",
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!runs?.length) return [];

  const { data: acts } = await supabase
    .from("openai_containment_actions")
    .select(
      "run_id, session_id, contact_name, contact_phone, outcome, reason, msgs_ia, msgs_paciente, dup_ratio, active_hours, error",
    )
    .in("run_id", runs.map((r) => r.id as string));

  const byRun = new Map<string, ContainmentAction[]>();
  for (const a of acts ?? []) {
    const list = byRun.get(a.run_id as string) ?? [];
    list.push({
      sessionId: a.session_id as string,
      contactName: (a.contact_name as string) ?? "(sem nome)",
      contactPhone: (a.contact_phone as string) ?? "",
      outcome: a.outcome as ContainmentAction["outcome"],
      reason: a.reason as string,
      msgsIa: Number(a.msgs_ia ?? 0),
      msgsPaciente: Number(a.msgs_paciente ?? 0),
      dupRatio: Number(a.dup_ratio ?? 0),
      activeHours: Number(a.active_hours ?? 0),
      error: (a.error as string | null) ?? null,
    });
    byRun.set(a.run_id as string, list);
  }

  return runs.map((r) => ({
    id: r.id as string,
    day: r.day as string,
    costUsd: Number(r.cost_usd ?? 0),
    status: r.status as string,
    dryRun: Boolean(r.dry_run),
    sessionsScanned: Number(r.sessions_scanned ?? 0),
    suspectsFound: Number(r.suspects_found ?? 0),
    sessionsClosed: Number(r.sessions_closed ?? 0),
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
    // Concluídas primeiro: é o que alguém abrindo a tela quer conferir.
    actions: (byRun.get(r.id as string) ?? []).sort((a, b) =>
      a.outcome === b.outcome ? 0 : a.outcome === "concluida" ? -1 : 1,
    ),
  }));
}

export type OpenAiAlertSettings = {
  enabled: boolean;
  dailyLimitUsd: number;
  spikeMultiplier: number;
  minCostUsd: number;
  /** Contenção ativa: conclui sozinha as conversas em loop após um estouro. */
  containmentEnabled: boolean;
  containmentMaxSessions: number;
  containmentMinDupRatio: number;
  containmentMinIaMsgs: number;
  containmentMinActiveHours: number;
};

export async function getOpenAiAlertSettings(): Promise<OpenAiAlertSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("openai_alert_settings")
    .select(
      "enabled, daily_limit_usd, spike_multiplier, min_cost_usd, containment_enabled, containment_max_sessions, containment_min_dup_ratio, containment_min_ia_msgs, containment_min_active_hours",
    )
    .eq("id", true)
    .maybeSingle();
  return {
    enabled: (data?.enabled as boolean) ?? true,
    dailyLimitUsd: Number(data?.daily_limit_usd ?? 5),
    spikeMultiplier: Number(data?.spike_multiplier ?? 2.5),
    minCostUsd: Number(data?.min_cost_usd ?? 1),
    containmentEnabled: (data?.containment_enabled as boolean) ?? true,
    containmentMaxSessions: Number(data?.containment_max_sessions ?? 5),
    containmentMinDupRatio: Number(data?.containment_min_dup_ratio ?? 0.5),
    containmentMinIaMsgs: Number(data?.containment_min_ia_msgs ?? 40),
    containmentMinActiveHours: Number(data?.containment_min_active_hours ?? 12),
  };
}

export async function updateOpenAiAlertSettings(
  input: OpenAiAlertSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (!(input.dailyLimitUsd > 0)) return { ok: false, error: "Limite diário deve ser positivo" };
  if (!(input.spikeMultiplier >= 1.5)) return { ok: false, error: "Multiplicador mínimo: 1,5×" };
  if (!(input.minCostUsd >= 0)) return { ok: false, error: "Piso não pode ser negativo" };
  // Limites do critério de contenção. Afrouxar demais faz a automação fechar
  // atendimento de paciente real, então os pisos aqui são deliberados.
  if (!(input.containmentMaxSessions >= 1 && input.containmentMaxSessions <= 20)) {
    return { ok: false, error: "Teto de conversas por rodada: entre 1 e 20" };
  }
  if (!(input.containmentMinDupRatio >= 0.3 && input.containmentMinDupRatio <= 1)) {
    return { ok: false, error: "Repetição mínima: entre 30% e 100%" };
  }
  if (!(input.containmentMinIaMsgs >= 10)) {
    return { ok: false, error: "Mínimo de respostas da IA: 10" };
  }
  if (!(input.containmentMinActiveHours >= 4 && input.containmentMinActiveHours <= 24)) {
    return { ok: false, error: "Horas ativas: entre 4 e 24" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("openai_alert_settings")
    .update({
      enabled: input.enabled,
      daily_limit_usd: input.dailyLimitUsd,
      spike_multiplier: input.spikeMultiplier,
      min_cost_usd: input.minCostUsd,
      containment_enabled: input.containmentEnabled,
      containment_max_sessions: input.containmentMaxSessions,
      containment_min_dup_ratio: input.containmentMinDupRatio,
      containment_min_ia_msgs: input.containmentMinIaMsgs,
      containment_min_active_hours: input.containmentMinActiveHours,
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes/ia");
  return { ok: true };
}
