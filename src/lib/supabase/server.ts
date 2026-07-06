import "server-only";
import { createServiceClient } from "./service";

/**
 * Client de banco para server actions/páginas. Desde a saída do Supabase Auth,
 * é o service client (bypass de RLS) — a autenticação é o cookie de sessão
 * próprio (lib/auth/session) e a autorização é app-level, como já era o modelo
 * (todo usuário autenticado é staff interno; ver integration-actions.ts).
 * Mantém a assinatura async para não tocar nos ~40 call sites existentes.
 */
export async function createClient() {
  return createServiceClient();
}
