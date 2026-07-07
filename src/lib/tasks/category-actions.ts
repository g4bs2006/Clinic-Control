"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

export type TaskCategoryRow = {
  id: string;
  slug: string;
  label: string;
  position: number;
  active: boolean;
};

const SLUG = /^[a-z0-9_]+$/;

async function requireUser() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

/** Todas as categorias, incluindo inativas — para a tela de configuração. */
export async function listTaskCategories(): Promise<TaskCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_categories")
    .select("id, slug, label, position, active")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskCategoryRow[];
}

/** Só as ativas, na ordem certa — para popular os selects de categoria. */
export async function listActiveTaskCategories(): Promise<TaskCategoryRow[]> {
  const rows = await listTaskCategories();
  return rows.filter((r) => r.active);
}

export async function upsertTaskCategory(input: {
  id?: string;
  slug: string;
  label: string;
  position: number;
  active: boolean;
}): Promise<{ ok: true; data: TaskCategoryRow } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const slug = input.slug.trim().toLowerCase();
  const label = input.label.trim();
  if (!SLUG.test(slug)) {
    return { ok: false, error: "Identificador inválido — use só letras minúsculas, números e _" };
  }
  if (label.length < 2) return { ok: false, error: "Rótulo muito curto" };

  const payload = { slug, label, position: input.position, active: input.active };
  const { data, error } = input.id
    ? await supabase.from("task_categories").update(payload).eq("id", input.id).select().single()
    : await supabase.from("task_categories").insert(payload).select().single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe uma categoria com esse identificador." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: data as TaskCategoryRow };
}

export async function deleteTaskCategory(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.from("task_categories").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Existem tarefas usando essa categoria — desative em vez de excluir.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
