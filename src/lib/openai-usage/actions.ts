"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCarteiraScope } from "@/lib/users/actions";
import { requireGestor } from "@/lib/auth/require-gestor";

// Dias em UTC (bucket da OpenAI — ver 0053_openai_usage.sql). O "mês" aqui é o
// mês UTC, que bate com o dashboard da OpenAI, não com o fuso de SP.

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
      projectId: string;
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

type UsageRow = {
  project_id: string;
  day: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
};

/** Consumo OpenAI da clínica num mês + KPIs de anomalia (ontem vs média 7d). */
export async function getClinicOpenAiUsage(
  clinicId: string,
  yearMonth?: string,
): Promise<ClinicOpenAiUsage> {
  try {
    const supabase = await createClient();
    const { data: clinic } = await supabase
      .from("clinics")
      .select("openai_project_id")
      .eq("id", clinicId)
      .maybeSingle();
    const projectId = (clinic?.openai_project_id as string | null) ?? null;
    if (!projectId) return { ok: true, linked: false };

    const ym = yearMonth ?? currentYearMonthUtc();
    const { start, end } = monthBounds(ym);
    // Além do mês pedido, os 8 dias anteriores a hoje alimentam ontem/média-7d
    // mesmo quando o usuário está olhando um mês passado.
    const kpiStart = new Date(Date.now() - 9 * 86400_000).toISOString().slice(0, 10);
    const rangeStart = kpiStart < start ? kpiStart : start;
    const rangeEnd = end > kpiStart ? end : new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("clinic_openai_usage")
      .select("project_id, day, cost_usd, input_tokens, output_tokens, requests")
      .eq("project_id", projectId)
      .gte("day", rangeStart)
      .lt("day", rangeEnd)
      .order("day");
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as UsageRow[];

    const monthRows = rows.filter((r) => r.day >= start && r.day < end);
    const days: OpenAiUsageDay[] = monthRows.map((r) => ({
      day: r.day,
      costUsd: Number(r.cost_usd),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      requests: Number(r.requests),
    }));

    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const yesterdayCostUsd = Number(rows.find((r) => r.day === yesterday)?.cost_usd ?? 0);
    const prev7 = rows.filter((r) => r.day < yesterday && r.day >= kpiStart);
    const avg7CostUsd = prev7.length
      ? prev7.reduce((s, r) => s + Number(r.cost_usd), 0) / prev7.length
      : null;

    return {
      ok: true,
      linked: true,
      projectId,
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
    .select("id, name, developer_id, openai_project_id")
    .not("openai_project_id", "is", null);
  if (scope.developerFilter) clinicsQuery = clinicsQuery.eq("developer_id", scope.developerFilter);
  const { data: clinics } = await clinicsQuery;
  if (!clinics?.length) return [];

  const ym = yearMonth ?? currentYearMonthUtc();
  const { start, end } = monthBounds(ym);
  const [py, pm] = start.split("-").map(Number);
  const prevStart = new Date(Date.UTC(py, pm - 2, 1)).toISOString().slice(0, 10);

  const projectIds = clinics.map((c) => c.openai_project_id as string);
  const [{ data: usage }, { data: alerts }] = await Promise.all([
    supabase
      .from("clinic_openai_usage")
      .select("project_id, day, cost_usd, input_tokens, output_tokens")
      .in("project_id", projectIds)
      .gte("day", prevStart)
      .lt("day", end),
    supabase
      .from("openai_usage_alerts")
      .select("project_id")
      .in("project_id", projectIds)
      .gte("day", start)
      .lt("day", end),
  ]);

  const alertedProjects = new Set((alerts ?? []).map((a) => a.project_id as string));
  const rows = clinics.map((c) => {
    const mine = ((usage ?? []) as UsageRow[]).filter((u) => u.project_id === c.openai_project_id);
    const inMonth = mine.filter((u) => u.day >= start && u.day < end);
    const inPrev = mine.filter((u) => u.day < start);
    return {
      clinicId: c.id as string,
      name: c.name as string,
      costUsd: inMonth.reduce((s, u) => s + Number(u.cost_usd), 0),
      prevMonthCostUsd: inPrev.reduce((s, u) => s + Number(u.cost_usd), 0),
      inputTokens: inMonth.reduce((s, u) => s + Number(u.input_tokens), 0),
      outputTokens: inMonth.reduce((s, u) => s + Number(u.output_tokens), 0),
      alerted: alertedProjects.has(c.openai_project_id as string),
    };
  });
  return rows.sort((a, b) => b.costUsd - a.costUsd);
}

export type OpenAiProjectOption = {
  projectId: string;
  name: string;
  status: string | null;
  /** Nome da clínica que já usa este projeto (para o select sinalizar). */
  linkedToClinic: string | null;
};

/** Projetos da organização (cache alimentado pelo cron collect-openai-usage). */
export async function listOpenAiProjects(): Promise<OpenAiProjectOption[]> {
  const supabase = await createClient();
  const [{ data: projects }, { data: linked }] = await Promise.all([
    supabase.from("openai_projects").select("project_id, name, status").order("name"),
    supabase.from("clinics").select("name, openai_project_id").not("openai_project_id", "is", null),
  ]);
  const linkedBy = new Map((linked ?? []).map((c) => [c.openai_project_id as string, c.name as string]));
  return (projects ?? []).map((p) => ({
    projectId: p.project_id as string,
    name: p.name as string,
    status: (p.status as string | null) ?? null,
    linkedToClinic: linkedBy.get(p.project_id as string) ?? null,
  }));
}

/** Vincula/desvincula o projeto OpenAI da clínica ("" limpa o vínculo). */
export async function updateClinicOpenAiProject(
  clinicId: string,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const value = projectId.trim();
  if (value) {
    const { data } = await supabase
      .from("openai_projects")
      .select("project_id")
      .eq("project_id", value)
      .maybeSingle();
    if (!data) return { ok: false, error: "Projeto desconhecido — rode a coleta para sincronizar" };
  }
  const { error } = await supabase
    .from("clinics")
    .update({ openai_project_id: value || null })
    .eq("id", clinicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  revalidatePath("/");
  return { ok: true };
}

export type OpenAiAlertSettings = {
  enabled: boolean;
  dailyLimitUsd: number;
  spikeMultiplier: number;
  minCostUsd: number;
};

export async function getOpenAiAlertSettings(): Promise<OpenAiAlertSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("openai_alert_settings")
    .select("enabled, daily_limit_usd, spike_multiplier, min_cost_usd")
    .eq("id", true)
    .maybeSingle();
  return {
    enabled: (data?.enabled as boolean) ?? true,
    dailyLimitUsd: Number(data?.daily_limit_usd ?? 5),
    spikeMultiplier: Number(data?.spike_multiplier ?? 2.5),
    minCostUsd: Number(data?.min_cost_usd ?? 1),
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("openai_alert_settings")
    .update({
      enabled: input.enabled,
      daily_limit_usd: input.dailyLimitUsd,
      spike_multiplier: input.spikeMultiplier,
      min_cost_usd: input.minCostUsd,
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}
