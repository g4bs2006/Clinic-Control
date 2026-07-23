"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGestor } from "@/lib/auth/require-gestor";
import { findOverlappingRule } from "@/lib/snapshots/status";

export type StatusRuleRow = {
  id: string;
  label: string;
  rate_min: number; // fração 0..1
  rate_max: number;
  color: string;
  position: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

// Configurar as faixas de status afeta a carteira inteira — ação de gestor.
// O desenvolvedor só visualiza (leitura via listStatusRules).
async function requireGestorClient() {
  const gate = await requireGestor();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  return { ok: true as const, supabase: await createClient() };
}

export async function listStatusRules(): Promise<StatusRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("status_rules")
    .select("id, label, rate_min, rate_max, color, position")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as StatusRuleRow[];
}

export async function upsertStatusRule(rule: {
  id?: string;
  label: string;
  rate_min: number;
  rate_max: number;
  color: string;
  position: number;
}): Promise<{ ok: true; data?: StatusRuleRow } | { ok: false; error: string }> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;
  const supabase = gate.supabase;

  const label = rule.label.trim();
  if (label.length < 2) return { ok: false, error: "Rótulo muito curto" };
  if (!HEX.test(rule.color)) return { ok: false, error: "Cor inválida (use #RRGGBB)" };
  if (!(rule.rate_min >= 0) || !(rule.rate_max > rule.rate_min)) {
    return { ok: false, error: "Faixa inválida: a taxa mínima deve ser menor que a máxima" };
  }

  const { data: existingRules, error: listError } = await supabase
    .from("status_rules")
    .select("id, label, rate_min, rate_max")
    .order("position");
  if (listError) return { ok: false, error: listError.message };

  const conflict = findOverlappingRule(
    { id: rule.id, rate_min: rule.rate_min, rate_max: rule.rate_max },
    (existingRules ?? []) as { id: string; label: string; rate_min: number; rate_max: number }[],
  );
  if (conflict) {
    const pct = (v: number) => `${+(Number(v) * 100).toFixed(2)}%`;
    return {
      ok: false,
      error: `A faixa se sobrepõe a "${conflict.label}" (${pct(conflict.rate_min)} – ${pct(conflict.rate_max)}). Ajuste os limites de uma das faixas antes de salvar.`,
    };
  }

  const payload = {
    label,
    rate_min: rule.rate_min,
    rate_max: rule.rate_max,
    color: rule.color,
    position: rule.position,
  };

  const { data, error } = rule.id
    ? await supabase.from("status_rules").update(payload).eq("id", rule.id).select()
    : await supabase.from("status_rules").insert(payload).select();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data?.[0] as StatusRuleRow };
}

export async function deleteStatusRule(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;
  const supabase = gate.supabase;

  const { error } = await supabase.from("status_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Reordena as faixas conforme a ordem dos ids (drag-and-drop). Só posições. */
export async function reorderStatusRules(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestorClient();
  if (!gate.ok) return gate;
  const supabase = gate.supabase;
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from("status_rules").update({ position: i }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export type FunnelStepRow = {
  id: string;
  name: string;
  position: number;
  counts_as_scheduling: boolean;
  counts_as_closing: boolean;
};

export async function listFunnelSteps(): Promise<FunnelStepRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funnel_steps")
    .select("id, name, position, counts_as_scheduling, counts_as_closing")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as FunnelStepRow[];
}
