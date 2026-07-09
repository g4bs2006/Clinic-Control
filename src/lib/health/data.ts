"use server";

import { createClient } from "@/lib/supabase/server";
import { monthKey, prevMonth } from "@/lib/snapshots/month";
import { listResponseStats } from "@/lib/whatsapp/actions";
import {
  computeHealth,
  type HealthSignals,
  type HealthBand,
  type HealthConfidence,
  type HealthFactor,
} from "./score";

export type StoredHealth = {
  clinicId: string;
  status: "scored" | "insuficiente";
  score: number | null;
  band: HealthBand | null;
  confidence: HealthConfidence | null;
  coverage: number;
  factors: HealthFactor[];
  // Delta em relação ao snapshot de ontem (null = sem base de comparação).
  prevScore: number | null;
  prevBand: HealthBand | null;
};

/** Data (YYYY-MM-DD) no fuso America/Sao_Paulo, com deslocamento em dias. */
function spDate(offsetDays = 0): string {
  const ms = Date.now() - 3 * 3_600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function bandIndexOf(
  rate: number | null,
  rules: { rate_min: number; rate_max: number }[],
): { index: number | null; count: number } {
  const sorted = [...rules].sort((a, b) => a.rate_min - b.rate_min);
  if (rate === null || sorted.length === 0) return { index: null, count: sorted.length };
  let idx = sorted.findIndex((r) => rate >= r.rate_min && rate <= r.rate_max);
  if (idx === -1) idx = rate < sorted[0].rate_min ? 0 : sorted.length - 1;
  return { index: idx, count: sorted.length };
}

/**
 * Health score da carteira (sob demanda). Lê o snapshot de HOJE das clínicas
 * pedidas; as que ainda não têm são calculadas agora (batch) e gravadas. Retorna
 * o resultado de hoje + o score/banda de ontem para o delta da tela de início.
 *
 * `currentRateOverride`: taxa do mês corrente por clínica (ex.: leitura ao vivo
 * já feita pelo dashboard) — evita recalcular/rebuscar a Helena. Quando ausente,
 * usa o snapshot mensal corrente; clínica sem taxa cai em "insuficiente".
 */
export async function getCarteiraHealth(
  clinicIds: string[],
  currentRateOverride: Map<string, number> | null = null,
): Promise<Map<string, StoredHealth>> {
  const out = new Map<string, StoredHealth>();
  if (clinicIds.length === 0) return out;

  const supabase = await createClient();
  const today = spDate(0);
  const yesterday = spDate(-1);

  const { data: existing } = await supabase
    .from("clinic_health_snapshots")
    .select("clinic_id, snapshot_date, status, score, band, confidence, coverage, factors")
    .in("clinic_id", clinicIds)
    .in("snapshot_date", [today, yesterday]);

  type Row = {
    clinic_id: string;
    snapshot_date: string;
    status: "scored" | "insuficiente";
    score: number | null;
    band: HealthBand | null;
    confidence: HealthConfidence | null;
    coverage: number;
    factors: HealthFactor[];
  };
  const todayByClinic = new Map<string, Row>();
  const yesterdayByClinic = new Map<string, Row>();
  for (const r of (existing ?? []) as Row[]) {
    (r.snapshot_date === today ? todayByClinic : yesterdayByClinic).set(r.clinic_id, r);
  }

  const toCompute = clinicIds.filter((id) => !todayByClinic.has(id));

  if (toCompute.length > 0) {
    const currentMonth = monthKey(new Date());
    const prevM = prevMonth(currentMonth);
    const since7d = spDate(-7);

    const [rulesRes, curRes, prevRes, sumRes, respStats, tasksRes, acompRes] = await Promise.all([
      supabase.from("status_rules").select("rate_min, rate_max"),
      supabase.from("monthly_snapshots").select("clinic_id, rate").eq("year_month", currentMonth).in("clinic_id", toCompute),
      supabase.from("monthly_snapshots").select("clinic_id, rate").eq("year_month", prevM).in("clinic_id", toCompute),
      supabase.from("whatsapp_daily_summaries").select("clinic_id, severity, highlights").gte("summary_date", since7d).in("clinic_id", toCompute),
      listResponseStats(currentMonth),
      supabase.from("tasks").select("clinic_id, due_date, priority").in("clinic_id", toCompute).in("status", ["pendente", "em_andamento"]),
      supabase.from("acompanhamentos").select("clinic_id").in("clinic_id", toCompute).eq("status", "aberto").eq("severity", "alta"),
    ]);

    const rules = (rulesRes.data ?? []) as { rate_min: number; rate_max: number }[];
    const curRate = new Map((curRes.data ?? []).map((r) => [r.clinic_id as string, r.rate as number]));
    const prevRate = new Map((prevRes.data ?? []).map((r) => [r.clinic_id as string, r.rate as number]));

    const summaries = new Map<string, { severity: "baixa" | "media" | "alta"; churn: boolean }[]>();
    for (const s of (sumRes.data ?? []) as { clinic_id: string; severity: string; highlights: { risco_churn?: boolean } | null }[]) {
      const arr = summaries.get(s.clinic_id) ?? [];
      arr.push({
        severity: (s.severity as "baixa" | "media" | "alta") ?? "baixa",
        churn: s.highlights?.risco_churn === true,
      });
      summaries.set(s.clinic_id, arr);
    }

    const respMin = new Map<string, number>();
    for (const r of respStats) {
      if (r.median_seconds != null) respMin.set(r.clinic_id, r.median_seconds / 60);
    }

    const overdue = new Map<string, number>();
    const highPrio = new Map<string, number>();
    for (const t of (tasksRes.data ?? []) as { clinic_id: string | null; due_date: string | null; priority: string }[]) {
      if (!t.clinic_id) continue;
      const isOverdue = !!t.due_date && t.due_date < today;
      if (isOverdue) overdue.set(t.clinic_id, (overdue.get(t.clinic_id) ?? 0) + 1);
      else if (t.priority === "alta" || t.priority === "urgente")
        highPrio.set(t.clinic_id, (highPrio.get(t.clinic_id) ?? 0) + 1);
    }

    const acompAlta = new Map<string, number>();
    for (const a of (acompRes.data ?? []) as { clinic_id: string | null }[]) {
      if (!a.clinic_id) continue;
      acompAlta.set(a.clinic_id, (acompAlta.get(a.clinic_id) ?? 0) + 1);
    }

    const rowsToInsert: Row[] = [];
    for (const id of toCompute) {
      const rate = currentRateOverride?.get(id) ?? curRate.get(id) ?? null;
      const { index, count } = bandIndexOf(rate, rules);
      const signals: HealthSignals = {
        bandIndex: index,
        bandCount: count,
        summaries7d: summaries.get(id) ?? [],
        overdueTasks: overdue.get(id) ?? 0,
        highPriorityTasks: highPrio.get(id) ?? 0,
        highSeverityAcomp: acompAlta.get(id) ?? 0,
        rate,
        ratePrev: prevRate.get(id) ?? null,
        responseMedianMin: respMin.get(id) ?? null,
      };
      const res = computeHealth(signals);
      rowsToInsert.push({
        clinic_id: id,
        snapshot_date: today,
        status: res.status,
        score: res.score,
        band: res.band,
        confidence: res.confidence,
        coverage: res.coverage,
        factors: res.factors,
      });
    }

    if (rowsToInsert.length > 0) {
      await supabase.from("clinic_health_snapshots").upsert(rowsToInsert, { onConflict: "clinic_id,snapshot_date" });
      for (const r of rowsToInsert) todayByClinic.set(r.clinic_id, r);
    }
  }

  for (const id of clinicIds) {
    const t = todayByClinic.get(id);
    if (!t) continue;
    const y = yesterdayByClinic.get(id);
    out.set(id, {
      clinicId: id,
      status: t.status,
      score: t.score,
      band: t.band,
      confidence: t.confidence,
      coverage: t.coverage,
      factors: t.factors ?? [],
      prevScore: y?.score ?? null,
      prevBand: y?.band ?? null,
    });
  }

  return out;
}
