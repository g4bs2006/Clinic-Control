"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword, generateTempPassword } from "@/lib/auth/password";

/** Cookie global com a carteira (developer_id) que o gestor escolheu filtrar. */
const CARTEIRA_COOKIE = "cc-carteira";

export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  role: "gestor" | "desenvolvedor";
  active?: boolean;
};

/** Perfil do usuário logado (null se não autenticado ou inativo). */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, active: user.active };
}

/** Todos os perfis (para a seção Usuários e selects de carteira). */
export async function listUserProfiles(): Promise<UserProfile[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, name, role, active")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserProfile[];
}

export type CarteiraScope = {
  profile: UserProfile | null;
  /** Filtro efetivo de carteira: forçado ao próprio id p/ desenvolvedor; param validado p/ gestor. */
  developerFilter: string | null;
  /** Opções do select de carteira — vazio para desenvolvedor (não pode trocar). */
  developerOptions: { id: string; name: string }[];
};

/**
 * Resolve o escopo de carteira da página: desenvolvedor enxerga só a própria
 * carteira (filtro forçado); gestor enxerga tudo e pode filtrar globalmente.
 *
 * Para o gestor, a carteira ativa vem do cookie global `cc-carteira` (definido
 * pelo seletor da sidebar), persistindo entre navegações. Um `devOverride`
 * explícito (ex.: deep-link `?dev=`) tem prioridade sobre o cookie.
 */
export async function getCarteiraScope(devOverride?: string): Promise<CarteiraScope> {
  const [profile, profiles] = await Promise.all([getCurrentProfile(), listUserProfiles()]);

  if (profile?.role === "desenvolvedor") {
    return { profile, developerFilter: profile.id, developerOptions: [] };
  }

  let selected = devOverride;
  if (selected === undefined) {
    const store = await cookies();
    selected = store.get(CARTEIRA_COOKIE)?.value;
  }
  const valid = selected && profiles.some((p) => p.id === selected) ? selected : null;
  return {
    profile,
    developerFilter: valid,
    developerOptions: profiles.map((p) => ({
      id: p.id,
      name: p.name || p.email || p.id.slice(0, 8),
    })),
  };
}

/**
 * Define a carteira ativa do gestor no cookie global. `null` = todas as carteiras.
 * Só gestor pode filtrar; desenvolvedor tem escopo forçado à própria carteira.
 */
export async function setCarteira(devId: string | null) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const store = await cookies();
  if (devId) {
    store.set(CARTEIRA_COOKIE, devId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    store.delete(CARTEIRA_COOKIE);
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

async function requireGestor(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (profile.role !== "gestor") return { ok: false, error: "Apenas gestores podem fazer isso" };
  return { ok: true, userId: profile.id };
}

/** Troca o papel de um usuário — apenas gestor. */
export async function updateUserRole(userId: string, role: "gestor" | "desenvolvedor") {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (role !== "gestor" && userId === gate.userId) {
    return { ok: false as const, error: "Você não pode remover seu próprio papel de gestor" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("app_users").update({ role }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true as const };
}

/** Ativa/desativa um usuário — apenas gestor. Inativo não loga nem mantém sessão. */
export async function setUserActive(userId: string, active: boolean) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (!active && userId === gate.userId) {
    return { ok: false as const, error: "Você não pode desativar a si mesmo" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("app_users").update({ active }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true as const };
}

/**
 * Redefine a senha de um usuário para uma temporária — apenas gestor.
 * A senha é retornada UMA vez para o gestor repassar; a pessoa troca depois
 * em Configurações → Minha conta.
 */
export async function resetUserPassword(userId: string) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const temp = generateTempPassword();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("app_users")
    .update({ password_hash: await hashPassword(temp) })
    .eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, tempPassword: temp };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cria um usuário direto (apenas gestor): define nome, e-mail e papel e gera
 * uma senha temporária que o gestor repassa. A pessoa troca depois em
 * Configurações → Minha conta. Retorna a senha UMA vez.
 */
export async function createUser(
  name: string,
  email: string,
  role: "gestor" | "desenvolvedor",
) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const trimmedName = name.trim();
  if (trimmedName.length < 2) return { ok: false as const, error: "Informe o nome do usuário" };
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return { ok: false as const, error: "E-mail inválido" };

  const temp = generateTempPassword();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_users")
    .insert({ email: normalized, name: trimmedName, password_hash: await hashPassword(temp), role, active: true })
    .select("id, email, name, role, active")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Já existe um usuário com esse e-mail" };
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/configuracoes");
  return { ok: true as const, tempPassword: temp, user: data as UserProfile };
}

/** Edita nome e e-mail de um usuário — apenas gestor. (Papel/ativo têm ações próprias.) */
export async function updateUser(userId: string, patch: { name: string; email: string }) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const trimmedName = patch.name.trim();
  if (trimmedName.length < 2) return { ok: false as const, error: "Informe o nome do usuário" };
  const normalized = patch.email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return { ok: false as const, error: "E-mail inválido" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("app_users")
    .update({ name: trimmedName, email: normalized })
    .eq("id", userId);
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Já existe um usuário com esse e-mail" };
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/configuracoes");
  return { ok: true as const };
}

/**
 * Exclui um usuário de vez — apenas gestor. Não pode excluir a si mesmo nem o
 * único gestor ativo. As referências caem por FK: clínicas/tarefas/comentários
 * ficam com responsável nulo; o checklist PESSOAL do usuário é removido (cascata).
 */
export async function deleteUser(userId: string) {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (userId === gate.userId) {
    return { ok: false as const, error: "Você não pode excluir a si mesmo" };
  }

  const supabase = createServiceClient();
  const { data: target } = await supabase
    .from("app_users")
    .select("role, active")
    .eq("id", userId)
    .maybeSingle();

  if (target?.role === "gestor" && target.active) {
    const { count } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role", "gestor")
      .eq("active", true);
    if ((count ?? 0) <= 1) {
      return { ok: false as const, error: "Não é possível excluir o único gestor ativo" };
    }
  }

  const { error } = await supabase.from("app_users").delete().eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/configuracoes");
  revalidatePath("/");
  return { ok: true as const };
}

/** Troca a própria senha (exige a senha atual). */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  if (newPassword.length < 8) {
    return { ok: false as const, error: "A nova senha precisa ter pelo menos 8 caracteres" };
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("app_users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !(await verifyPassword(currentPassword, data.password_hash as string | null))) {
    return { ok: false as const, error: "Senha atual incorreta" };
  }

  const { error } = await supabase
    .from("app_users")
    .update({ password_hash: await hashPassword(newPassword) })
    .eq("id", user.id);
  if (error) return { ok: false as const, error: error.message };
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
