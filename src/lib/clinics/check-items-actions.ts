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
  category_id: string | null;
};

export type ClinicCheckRow = {
  check_item_id: string;
  label: string;
  position: number;
  checked: boolean;
  is_global: boolean;
  category_id: string | null;
  category_label: string | null;
  category_position: number | null;
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

/**
 * Itens que `ownerId` (default: logado) GERENCIA no editor — todos os que ele
 * possui, pessoais e fixos. Como só o gestor cria fixos (owner = gestor), um dev
 * vê só os pessoais dele; o gestor vê os pessoais + os fixos que criou.
 */
export async function listCheckItems(ownerId?: string): Promise<CheckItemRow[]> {
  const supabase = await createClient();
  const owner = ownerId ?? (await currentUserId());
  if (!owner) return [];
  const { data, error } = await supabase
    .from("check_items")
    .select("id, label, position, is_global, category_id")
    .eq("owner_id", owner)
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
    .select("id, label, position, is_global, category_id")
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
  categoryId?: string | null;
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

  const payload = {
    label,
    position: item.position,
    is_global: isGlobal,
    category_id: item.categoryId ?? null,
  };

  // Criação: nasce com o dono (criador) e o flag is_global.
  if (!item.id) {
    const { data, error } = await supabase
      .from("check_items")
      .insert({ ...payload, owner_id: owner })
      .select();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: data?.[0] as CheckItemRow };
  }

  // Edição: autoriza pelo estado atual. Mexer em item fixo (origem OU destino)
  // exige gestor; item pessoal só o próprio dono edita. Permite ALTERNAR o flag.
  const { data: existing } = await supabase
    .from("check_items")
    .select("owner_id, is_global")
    .eq("id", item.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Item não encontrado" };
  if ((existing.is_global || isGlobal) && !(await isGestor())) {
    return { ok: false, error: "Apenas o gestor gerencia itens fixos" };
  }
  if (!existing.is_global && existing.owner_id !== owner) {
    return { ok: false, error: "Este item pertence ao checklist de outro usuário" };
  }

  const { data, error } = await supabase
    .from("check_items")
    .update(payload)
    .eq("id", item.id)
    .select();
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
      .select("id, label, position, is_global, category_id, check_item_categories(label, position)")
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

  return (itemsRes.data ?? []).map((item) => {
    const catRaw = item.check_item_categories as
      | { label: string; position: number }
      | { label: string; position: number }[]
      | null;
    const cat = Array.isArray(catRaw) ? catRaw[0] ?? null : catRaw;
    return {
      check_item_id: item.id as string,
      label: item.label as string,
      position: item.position as number,
      is_global: item.is_global as boolean,
      category_id: (item.category_id as string | null) ?? null,
      category_label: cat?.label ?? null,
      category_position: cat?.position ?? null,
      checked: checkedMap.get(item.id as string) ?? false,
    };
  });
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
