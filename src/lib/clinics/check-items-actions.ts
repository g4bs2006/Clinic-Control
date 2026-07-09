"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/users/actions";

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckItemRow = {
  id: string;
  label: string;
  position: number;
  is_global: boolean;
};

export type ClinicCheckRow = {
  check_item_id: string;
  label: string;
  position: number;
  checked: boolean;
  is_global: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

/** Id do usuário logado (ou null). */
async function currentUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}

/** Só o gestor gerencia o checklist fixo (global). */
async function isGestor(): Promise<boolean> {
  return (await getCurrentProfile())?.role === "gestor";
}

// ── Check Items ──────────────────────────────────────────────────────────────
// Dois tipos: PESSOAIS (owner_id, is_global=false) — cada usuário tem os seus; e
// FIXOS/GLOBAIS (is_global=true) — aparecem em toda clínica, para todos, e só o
// gestor os gerencia. O estado marcado é sempre individual por usuário.

/** Itens PESSOAIS de `ownerId` (default: o usuário logado). */
export async function listCheckItems(ownerId?: string): Promise<CheckItemRow[]> {
  const supabase = await createClient();
  const owner = ownerId ?? (await currentUserId());
  if (!owner) return [];
  const { data, error } = await supabase
    .from("check_items")
    .select("id, label, position, is_global")
    .eq("owner_id", owner)
    .eq("is_global", false)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as CheckItemRow[];
}

/** Itens FIXOS/GLOBAIS (aparecem em todas as clínicas, para todos). */
export async function listGlobalCheckItems(): Promise<CheckItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("check_items")
    .select("id, label, position, is_global")
    .eq("is_global", true)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as CheckItemRow[];
}

/** Itens VISÍVEIS para um usuário: os pessoais dele + todos os fixos. */
export async function listVisibleCheckItems(userId?: string): Promise<CheckItemRow[]> {
  const supabase = await createClient();
  const owner = userId ?? (await currentUserId());
  if (!owner) return [];
  const { data, error } = await supabase
    .from("check_items")
    .select("id, label, position, is_global")
    .or(`owner_id.eq.${owner},is_global.eq.true`)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as CheckItemRow[];
}

export async function upsertCheckItem(item: {
  id?: string;
  label: string;
  position: number;
  isGlobal?: boolean;
}): Promise<{ ok: true; data?: CheckItemRow } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const owner = (await currentUserId())!;
  const isGlobal = item.isGlobal ?? false;

  if (isGlobal && !(await isGestor())) {
    return { ok: false, error: "Apenas o gestor gerencia o checklist fixo" };
  }

  const label = item.label.trim();
  if (label.length < 2) return { ok: false, error: "Rótulo muito curto" };

  const payload = { label, position: item.position };

  // Global: gestor já autorizado, casa pelo id + is_global. Pessoal: casa pelo
  // dono. Insert nasce com o dono (criador) e o flag is_global.
  const { data, error } = item.id
    ? await (isGlobal
        ? supabase.from("check_items").update(payload).eq("id", item.id).eq("is_global", true).select()
        : supabase.from("check_items").update(payload).eq("id", item.id).eq("owner_id", owner).eq("is_global", false).select())
    : await supabase.from("check_items").insert({ ...payload, owner_id: owner, is_global: isGlobal }).select();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data?.[0] as CheckItemRow };
}

export async function deleteCheckItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };
  const owner = (await currentUserId())!;

  const { data: item } = await supabase
    .from("check_items")
    .select("owner_id, is_global")
    .eq("id", id)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item não encontrado" };

  if (item.is_global) {
    if (!(await isGestor())) return { ok: false, error: "Apenas o gestor gerencia o checklist fixo" };
    const { error } = await supabase.from("check_items").delete().eq("id", id).eq("is_global", true);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("check_items").delete().eq("id", id).eq("owner_id", owner);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Clinic Checks (estado por clínica E por usuário) ─────────────────────────

/**
 * Checklist de `ownerId` (default: usuário logado) para a clínica: os itens
 * pessoais dele + os fixos, com o estado marcado DESSE usuário.
 */
export async function listClinicChecks(
  clinicId: string,
  ownerId?: string,
): Promise<ClinicCheckRow[]> {
  const supabase = await createClient();
  const owner = ownerId ?? (await currentUserId());
  if (!owner) return [];

  const [itemsRes, checksRes] = await Promise.all([
    supabase
      .from("check_items")
      .select("id, label, position, is_global")
      .or(`owner_id.eq.${owner},is_global.eq.true`)
      .order("position"),
    supabase
      .from("clinic_checks")
      .select("check_item_id, checked")
      .eq("clinic_id", clinicId)
      .eq("user_id", owner),
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
    is_global: item.is_global as boolean,
    checked: checkedMap.get(item.id as string) ?? false,
  }));
}

/** clinic_checks de um usuário (default: logado) em todas as clínicas, p/ a listagem. */
export async function listAllClinicChecks(
  userId?: string,
): Promise<Map<string, Map<string, boolean>>> {
  const supabase = await createClient();
  const uid = userId ?? (await currentUserId());
  if (!uid) return new Map();

  const { data, error } = await supabase
    .from("clinic_checks")
    .select("clinic_id, check_item_id, checked")
    .eq("user_id", uid);
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

  const user = (await currentUserId())!;
  const { data: item } = await supabase
    .from("check_items")
    .select("owner_id, is_global")
    .eq("id", checkItemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item não encontrado" };
  // Item pessoal só pode ser marcado pelo dono; item fixo, por qualquer um
  // (cada um marca o PRÓPRIO estado).
  if (!item.is_global && item.owner_id !== user) {
    return { ok: false, error: "Este item pertence ao checklist de outro usuário" };
  }

  const { error } = await supabase.from("clinic_checks").upsert(
    {
      clinic_id: clinicId,
      check_item_id: checkItemId,
      checked,
      user_id: user,
    },
    { onConflict: "clinic_id,check_item_id,user_id" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  revalidatePath("/clinicas");
  return { ok: true };
}
