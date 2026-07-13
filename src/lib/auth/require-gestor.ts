import { getSessionUser } from "@/lib/auth/session";

/**
 * Gate de gestor compartilhado pelas server actions. Antes vivia copiado em
 * users/actions.ts e vault/actions.ts (e uma variação em
 * check-categories-actions.ts) — mudança no modelo de papéis agora acontece
 * num lugar só. getSessionUser já valida assinatura, expiração e usuário
 * ativo no banco.
 */
export async function requireGestor(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.role !== "gestor") return { ok: false, error: "Apenas gestores podem fazer isso" };
  return { ok: true, userId: user.id };
}
