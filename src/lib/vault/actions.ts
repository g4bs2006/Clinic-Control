"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile } from "@/lib/users/actions";
import { encryptToken, decryptToken } from "@/lib/crypto/token";

const VAULT_PATH = "/cofre";

async function requireGestor(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (profile.role !== "gestor") return { ok: false, error: "Apenas gestores acessam o cofre de credenciais" };
  return { ok: true, userId: profile.id };
}

export type CredentialSummary = {
  id: string;
  service: string;
  category: string | null;
  login: string | null;
  url: string | null;
  notes: string | null;
  hasSecret: boolean;
  updatedAt: string;
};

export type CredentialInput = {
  service: string;
  category: string | null;
  login: string | null;
  secret: string | null; // string vazia/null = não altera o segredo em updates; ver updateCredential
  url: string | null;
  notes: string | null;
};

/** Lista todas as credenciais SEM o segredo (nunca decripta em listagem). */
export async function listCredentials(): Promise<
  { ok: true; credentials: CredentialSummary[] } | { ok: false; error: string }
> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("credential_vault")
    .select("id, service, category, login, secret_encrypted, url, notes, updated_at")
    .order("category", { ascending: true, nullsFirst: false })
    .order("service", { ascending: true });
  if (error) return { ok: false as const, error: error.message };

  const credentials: CredentialSummary[] = (data ?? []).map((row) => ({
    id: row.id,
    service: row.service,
    category: row.category,
    login: row.login,
    url: row.url,
    notes: row.notes,
    hasSecret: !!row.secret_encrypted,
    updatedAt: row.updated_at,
  }));
  return { ok: true as const, credentials };
}

/** Decripta e revela o segredo de UMA credencial — sempre registra no log de auditoria. */
export async function revealSecret(
  credentialId: string,
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("credential_vault")
    .select("secret_encrypted")
    .eq("id", credentialId)
    .single();
  if (error || !data) return { ok: false as const, error: "Credencial não encontrada" };
  if (!data.secret_encrypted) return { ok: false as const, error: "Essa credencial não tem segredo cadastrado" };

  await supabase
    .from("credential_vault_access_log")
    .insert({ credential_id: credentialId, user_id: gate.userId });

  return { ok: true as const, secret: decryptToken(data.secret_encrypted as string) };
}

export async function createCredential(
  input: CredentialInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (!input.service.trim()) return { ok: false as const, error: "Serviço é obrigatório" };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("credential_vault")
    .insert({
      service: input.service.trim(),
      category: input.category?.trim() || null,
      login: input.login?.trim() || null,
      secret_encrypted: input.secret ? encryptToken(input.secret) : null,
      url: input.url?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Falha ao criar credencial" };

  revalidatePath(VAULT_PATH);
  return { ok: true as const, id: data.id };
}

/**
 * Atualiza uma credencial. `secret: null` mantém o segredo atual (não sobrescreve);
 * `secret: ""` também mantém — só uma string não-vazia troca o segredo cifrado.
 * Isso evita apagar o segredo por engano ao editar só o login/notas na UI.
 */
export async function updateCredential(
  credentialId: string,
  input: CredentialInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;
  if (!input.service.trim()) return { ok: false as const, error: "Serviço é obrigatório" };

  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {
    service: input.service.trim(),
    category: input.category?.trim() || null,
    login: input.login?.trim() || null,
    url: input.url?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  if (input.secret) patch.secret_encrypted = encryptToken(input.secret);

  const { error } = await supabase.from("credential_vault").update(patch).eq("id", credentialId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(VAULT_PATH);
  return { ok: true as const };
}

export async function deleteCredential(credentialId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { error } = await supabase.from("credential_vault").delete().eq("id", credentialId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(VAULT_PATH);
  return { ok: true as const };
}
