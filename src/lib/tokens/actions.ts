"use server";

import { revalidatePath } from "next/cache";
import { generateApiToken } from "@/lib/auth/api-tokens";
import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cada usuário só gerencia os PRÓPRIOS tokens — sem gate de gestor, e sem opção
 * de gerenciar o token de outro dev. Um token sempre escopa à carteira do
 * próprio dono (ver `src/lib/tokens/verify.ts`), então não há razão pra alguém
 * mexer no token de outra pessoa.
 */

export type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function listMyApiTokens(): Promise<ApiTokenRow[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ApiTokenRow[];
}

/** Retorna o token completo — única vez que ele existe fora do hash. */
export async function createApiToken(
  name: string,
): Promise<{ ok: true; id: string; token: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Dê um nome para o token" };

  const { token, hash, prefix } = generateApiToken();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .insert({ user_id: user.id, name: trimmed, token_hash: hash, token_prefix: prefix })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracoes/integracoes");
  return { ok: true, id: data.id as string, token };
}

export async function revokeApiToken(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id); // ownership check no próprio WHERE

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes/integracoes");
  return { ok: true };
}
