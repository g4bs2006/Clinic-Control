"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile } from "@/lib/users/actions";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export type UserInvite = {
  id: string;
  email: string;
  role: "gestor" | "desenvolvedor";
  created_at: string;
  used_at: string | null;
};

/** Convites cadastrados (pendentes e usados) — para a seção Usuários. */
export async function listInvites(): Promise<UserInvite[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_invites")
    .select("id, email, role, created_at, used_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserInvite[];
}

async function requireGestor(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.role === "gestor" ? profile.id : null;
}

/** Pré-aprova um e-mail para ativar conta — apenas gestor. */
export async function addInvite(email: string, role: "gestor" | "desenvolvedor") {
  const gestorId = await requireGestor();
  if (!gestorId) return { ok: false as const, error: "Apenas gestores podem convidar" };

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false as const, error: "E-mail inválido" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("user_invites")
    .insert({ email: normalized, role, invited_by: gestorId });
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "E-mail já convidado" };
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/configuracoes");
  return { ok: true as const };
}

/** Remove um convite pendente — apenas gestor. */
export async function removeInvite(id: string) {
  const gestorId = await requireGestor();
  if (!gestorId) return { ok: false as const, error: "Apenas gestores podem remover convites" };

  const supabase = createServiceClient();
  const { error } = await supabase.from("user_invites").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true as const };
}

/**
 * Ativa a conta de um e-mail pré-aprovado ("Novo por aqui?" no login).
 * Ação PÚBLICA — o gate é o convite pendente. Cria (ou completa) o usuário em
 * app_users com a senha escolhida, aplica o papel do convite, marca used_at e loga.
 */
export async function activateAccount(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (password.length < 8) {
    return { ok: false as const, error: "A senha precisa ter pelo menos 8 caracteres" };
  }

  const service = createServiceClient();

  const { data: invite } = await service
    .from("user_invites")
    .select("id, role, used_at")
    .eq("email", normalized)
    .maybeSingle();
  if (!invite) {
    return { ok: false as const, error: "E-mail não autorizado — peça ao gestor para te convidar" };
  }
  if (invite.used_at) {
    return { ok: false as const, error: "Esta conta já foi ativada — use 'Entrar' com sua senha" };
  }

  const passwordHash = await hashPassword(password);
  const name = normalized.split("@")[0];

  // O usuário pode já existir (migrado do Supabase Auth) — só completa a senha.
  const { data: existing } = await service
    .from("app_users")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  let userId: string;
  if (existing) {
    const { error } = await service
      .from("app_users")
      .update({ password_hash: passwordHash, role: invite.role, active: true })
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message };
    userId = existing.id as string;
  } else {
    const { data, error } = await service
      .from("app_users")
      .insert({ email: normalized, name, password_hash: passwordHash, role: invite.role })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false as const, error: error?.message ?? "Falha ao criar usuário" };
    }
    userId = data.id as string;
  }

  await service.from("user_invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

  // Login imediato.
  await createSession(userId);
  return { ok: true as const };
}
