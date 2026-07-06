import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { signSessionToken, verifySessionToken } from "./token";
import { SESSION_COOKIE_NAME as SESSION_COOKIE } from "./cookie-name";

const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "gestor" | "desenvolvedor";
  active: boolean;
};

export async function createSession(userId: string) {
  const expiresAtMs = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = await signSessionToken(userId, expiresAtMs);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** userId da sessão (só assinatura+expiração — não consulta o banco). */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Usuário da sessão, validado no banco (existe e está ativo).
 * Substitui o antigo padrão createClient()+auth.getUser() das server actions.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("app_users")
    .select("id, email, name, role, active")
    .eq("id", userId)
    .maybeSingle();
  const user = data as SessionUser | null;
  if (!user || !user.active) return null;
  return user;
}
