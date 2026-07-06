"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

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
  if (!(await getSessionUser())) return null;
  return createClient();
}

// ── Check Items (checklist PESSOAL — cada usuário tem os seus) ──────────────

/** Id do usuário logado (ou null). */
async function currentUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}

/** Itens do checklist de `ownerId` — default: o usuário logado. */
export async function listCheckItems(ownerId?: string): Promise<CheckItemRow[]> {
  const supabase = await createClient();
  const owner = ownerId ?? (await currentUserId());
  if (!owner) return [];
  const { data, error } = await supabase
    .from("check_items")
    .select("id, label, position")
    .eq("owner_id", owner)
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
  const owner = (await currentUserId())!;

  const label = item.label.trim();
  if (label.length < 2) return { ok: false, error: "Rótulo muito curto" };

  const payload = { label, position: item.position };

  // Update só alcança itens do próprio usuário; insert nasce com o dono.
  const { error } = item.id
    ? await supabase.from("check_items").update(payload).eq("id", item.id).eq("owner_id", owner)
    : await supabase.from("check_items").insert({ ...payload, owner_id: owner });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function deleteCheckItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const owner = (await currentUserId())!;

  const { error } = await supabase.from("check_items").delete().eq("id", id).eq("owner_id", owner);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}

// ── Clinic Checks (per-clinic values) ────────────────────────────────────────

/** Itens do checklist de `ownerId` (default: usuário logado) com o estado na clínica. */
export async function listClinicChecks(
  clinicId: string,
  ownerId?: string,
): Promise<ClinicCheckRow[]> {
  const supabase = await createClient();
  const owner = ownerId ?? (await currentUserId());
  if (!owner) return [];

  // Fetch the owner's items + any existing checks for this clinic
  const [itemsRes, checksRes] = await Promise.all([
    supabase
      .from("check_items")
      .select("id, label, position")
      .eq("owner_id", owner)
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

  // Só o dono do item pode marcar — a visão do gestor é somente leitura.
  const owner = (await currentUserId())!;
  const { data: item } = await supabase
    .from("check_items")
    .select("owner_id")
    .eq("id", checkItemId)
    .maybeSingle();
  if (!item || item.owner_id !== owner) {
    return { ok: false, error: "Este item pertence ao checklist de outro usuário" };
  }

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
