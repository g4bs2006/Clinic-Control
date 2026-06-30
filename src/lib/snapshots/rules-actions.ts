"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StatusRuleRow = {
  id: string;
  label: string;
  rate_min: number; // fração 0..1
  rate_max: number;
  color: string;
  position: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return supabase;
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const label = rule.label.trim();
  if (label.length < 2) return { ok: false, error: "Rótulo muito curto" };
  if (!HEX.test(rule.color)) return { ok: false, error: "Cor inválida (use #RRGGBB)" };
  if (!(rule.rate_min >= 0) || !(rule.rate_max > rule.rate_min)) {
    return { ok: false, error: "Faixa inválida: a taxa mínima deve ser menor que a máxima" };
  }

  const payload = {
    label,
    rate_min: rule.rate_min,
    rate_max: rule.rate_max,
    color: rule.color,
    position: rule.position,
  };

  const { error } = rule.id
    ? await supabase.from("status_rules").update(payload).eq("id", rule.id)
    : await supabase.from("status_rules").insert(payload);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function deleteStatusRule(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.from("status_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
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
