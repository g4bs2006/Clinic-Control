"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  role: "gestor" | "desenvolvedor";
};

/** Perfil do usuário logado (null se não autenticado). */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_profiles")
    .select("id, email, name, role")
    .eq("id", user.id)
    .maybeSingle();
  return (data as UserProfile | null) ?? null;
}

/** Todos os perfis (para a seção Usuários e selects de carteira). */
export async function listUserProfiles(): Promise<UserProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, name, role")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserProfile[];
}

async function requireGestor(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (profile.role !== "gestor") return { ok: false, error: "Apenas gestores podem fazer isso" };
  return { ok: true, userId: profile.id };
}

/** Troca o papel de um usuário — apenas gestor; escrita via service_role. */
export async function updateUserRole(userId: string, role: "gestor" | "desenvolvedor") {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (role !== "gestor" && userId === gate.userId) {
    return { ok: false as const, error: "Você não pode remover seu próprio papel de gestor" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("user_profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true as const };
}

/** Define o desenvolvedor responsável (carteira) de uma clínica — apenas gestor. */
export async function updateClinicDeveloper(clinicId: string, developerId: string | null) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("clinics")
    .update({ developer_id: developerId })
    .eq("id", clinicId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  revalidatePath("/clinicas");
  return { ok: true as const };
}
