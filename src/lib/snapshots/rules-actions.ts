"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

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
  if (!(await getSessionUser())) return null;
  return createClient();
}

export async function listStatusRules(): Promise<StatusRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("status_rules")
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
