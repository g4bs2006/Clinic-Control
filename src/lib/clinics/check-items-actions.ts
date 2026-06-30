"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckItemRow = {
  id: string;
  label: string;
  position: number;
};

export type ClinicCheckRow = {
  check_item_id: string;
  label: string;
  position: number;
  checked: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return supabase;
}

// ── Check Items (global catalog) ─────────────────────────────────────────────

export async function listCheckItems(): Promise<CheckItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("check_items")
    .select("id, label, position")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as CheckItemRow[];
}

export async function upsertCheckItem(item: {
  id?: string;
  label: string;
  position: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const label = item.label.trim();
  if (label.length < 2) return { ok: false, error: "Rótulo muito curto" };

  const payload = { label, position: item.position };

  const { error } = item.id
    ? await supabase.from("check_items").update(payload).eq("id", item.id)
    : await supabase.from("check_items").insert(payload);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function deleteCheckItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.from("check_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}

// ── Clinic Checks (per-clinic values) ────────────────────────────────────────

/** Returns all check items with the checked state for a given clinic. */
export async function listClinicChecks(
  clinicId: string,
): Promise<ClinicCheckRow[]> {
  const supabase = await createClient();

  // Fetch all items + any existing checks for this clinic
  const [itemsRes, checksRes] = await Promise.all([
    supabase
      .from("check_items")
      .select("id, label, position")
      .order("position"),
    supabase
      .from("clinic_checks")
      .select("check_item_id, checked")
      .eq("clinic_id", clinicId),
  ]);

  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (checksRes.error) throw new Error(checksRes.error.message);

  const checkedMap = new Map(
    (checksRes.data ?? []).map((c) => [c.check_item_id, c.checked as boolean]),
  );

  return (itemsRes.data ?? []).map((item) => ({
    check_item_id: item.id as string,
    label: item.label as string,
    position: item.position as number,
    checked: checkedMap.get(item.id as string) ?? false,
  }));
}

/** Returns clinic_checks for multiple clinics at once (for the listing page). */
export async function listAllClinicChecks(): Promise<
  Map<string, Map<string, boolean>>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_checks")
    .select("clinic_id, check_item_id, checked");
  if (error) throw new Error(error.message);

  const result = new Map<string, Map<string, boolean>>();
  for (const row of data ?? []) {
    const clinicId = row.clinic_id as string;
    if (!result.has(clinicId)) result.set(clinicId, new Map());
    result.get(clinicId)!.set(row.check_item_id as string, row.checked as boolean);
  }
  return result;
}

export async function toggleClinicCheck(
  clinicId: string,
  checkItemId: string,
  checked: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.from("clinic_checks").upsert(
    {
      clinic_id: clinicId,
      check_item_id: checkItemId,
      checked,
    },
    { onConflict: "clinic_id,check_item_id" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  revalidatePath("/clinicas");
  return { ok: true };
}
