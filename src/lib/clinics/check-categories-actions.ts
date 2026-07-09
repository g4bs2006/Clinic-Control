"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/users/actions";

export type CheckCategoryRow = {
  id: string;
  label: string;
  position: number;
};

async function requireGestor() {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
  if ((await getCurrentProfile())?.role !== "gestor")
    return { ok: false as const, error: "Apenas o gestor gerencia as categorias do checklist" };
  return { ok: true as const };
}

/** Categorias do checklist (ordenadas) — para o editor e os selects. */
export async function listCheckCategories(): Promise<CheckCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("check_item_categories")
    .select("id, label, position")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as CheckCategoryRow[];
}

export async function upsertCheckCategory(input: {
  id?: string;
  label: string;
  position: number;
}): Promise<{ ok: true; data: CheckCategoryRow } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const label = input.label.trim();
  if (label.length < 2) return { ok: false as const, error: "Rótulo muito curto" };

  const supabase = await createClient();
  const payload = { label, position: input.position };
  const { data, error } = input.id
    ? await supabase.from("check_item_categories").update(payload).eq("id", input.id).select().single()
    : await supabase.from("check_item_categories").insert(payload).select().single();

  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Já existe uma categoria com esse nome." };
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true as const, data: data as CheckCategoryRow };
}

export async function deleteCheckCategory(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  // FK é ON DELETE SET NULL: excluir a categoria só solta o vínculo dos itens.
  const supabase = await createClient();
  const { error } = await supabase.from("check_item_categories").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}
