"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { requireGestor } from "@/lib/auth/require-gestor";
import { getSessionUser } from "@/lib/auth/session";
import { encryptToken, decryptToken } from "@/lib/crypto/token";

// Chave própria do cofre com fallback na chave da Helena: quando VAULT_ENC_KEY
// não existe, encryptToken/decryptToken usam HELENA_TOKEN_ENC_KEY (comportamento
// original). Definir VAULT_ENC_KEY desacopla os dois domínios — rotacionar a
// chave da Helena deixa de brickar o cofre e vice-versa. O decrypt tenta a
// chave do cofre e cai na da Helena para linhas cifradas antes da separação.
function vaultKey(): string | undefined {
  return process.env.VAULT_ENC_KEY || undefined;
}

function encryptSecret(plain: string): string {
  return encryptToken(plain, vaultKey());
}

function decryptSecret(payload: string): string {
  const key = vaultKey();
  if (key) {
    try {
      return decryptToken(payload, key);
    } catch {
      // Linha legada, cifrada na chave compartilhada antes de VAULT_ENC_KEY existir.
      return decryptToken(payload);
    }
  }
  return decryptToken(payload);
}

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

const SUMMARY_COLUMNS =
  "id, service, category, login, url, notes, has_secret, visible_to_devs, updated_at";

export type CredentialSummary = {
  id: string;
  service: string;
  category: string | null;
  login: string | null;
  url: string | null;
  notes: string | null;
  hasSecret: boolean;
  visibleToDevs: boolean;
  updatedAt: string;
};

export type CredentialInput = {
  service: string;
  category: string | null;
  login: string | null;
  /** Conteúdo sensível. Em update: vazio/whitespace = mantém o atual (ver clearSecret para remover). */
  secret: string | null;
  /** Update apenas: true remove o conteúdo sensível do item (secret_encrypted = null). */
  clearSecret?: boolean;
  /** Desenvolvedores podem listar e revelar este item (default: só gestores). */
  visibleToDevs: boolean;
  url: string | null;
  notes: string | null;
};

type SummaryRow = {
  id: string;
  service: string;
  category: string | null;
  login: string | null;
  url: string | null;
  notes: string | null;
  has_secret: boolean;
  visible_to_devs: boolean;
  updated_at: string;
};

function rowToSummary(row: SummaryRow): CredentialSummary {
  return {
    id: row.id,
    service: row.service,
    category: row.category,
    login: row.login,
    url: row.url,
    notes: row.notes,
    hasSecret: row.has_secret,
    visibleToDevs: row.visible_to_devs,
    updatedAt: row.updated_at,
  };
}

function validateInput(input: CredentialInput): string | null {
  if (!input.service.trim()) return "Título é obrigatório";
  const url = input.url?.trim();
  // Só http(s): uma URL "javascript:" salva aqui viraria XSS clicável no
  // próprio cofre — a página onde revelar qualquer segredo está a 1 action.
  if (url && !/^https?:\/\//i.test(url)) return "URL deve começar com http:// ou https://";
  return null;
}

// Mutações são registradas best-effort: a mutação em si já fica no banco e
// bloquear um save por falha de log seria pior que o warn. Revelação é
// diferente — lá o log é a ÚNICA evidência da exposição, então é gate duro
// (ver revealSecret).
async function logMutation(
  supabase: ReturnType<typeof createServiceClient>,
  entry: { credentialId: string | null; userId: string; service: string; action: string },
) {
  const { error } = await supabase.from("credential_vault_access_log").insert({
    credential_id: entry.credentialId,
    user_id: entry.userId,
    service: entry.service,
    action: entry.action,
  });
  if (error) console.warn(`vault: falha ao registrar ${entry.action} no log de auditoria: ${error.message}`);
}

/**
 * Lista itens SEM tocar em ciphertext (has_secret é coluna gerada no banco).
 * Gestor vê tudo; desenvolvedor vê só o que foi marcado visible_to_devs —
 * o filtro é aplicado AQUI (servidor), a UI só reflete.
 */
export async function listCredentials(): Promise<
  { ok: true; credentials: CredentialSummary[] } | { ok: false; error: string }
> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    let query = supabase
      .from("credential_vault")
      .select(SUMMARY_COLUMNS)
      .order("category", { ascending: true, nullsFirst: false })
      .order("service", { ascending: true });
    if (user.role !== "gestor") query = query.eq("visible_to_devs", true);
    const { data, error } = await query;
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, credentials: (data as SummaryRow[]).map(rowToSummary) };
  } catch (e) {
    return { ok: false as const, error: errMessage(e, "Falha ao listar o cofre") };
  }
}

/**
 * Decripta e revela o conteúdo de UM item. O registro de auditoria é gate
 * duro: se o insert no log falhar, o segredo NÃO é retornado — "cada
 * revelação é registrada" só é verdade se a revelação depender do registro.
 * O decrypt roda ANTES do log para uma falha de decrypt não deixar no log
 * uma revelação que nunca aconteceu.
 */
export async function revealSecret(
  credentialId: string,
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("credential_vault")
      .select("secret_encrypted, service, visible_to_devs")
      .eq("id", credentialId)
      .single();
    if (error || !data) return { ok: false as const, error: "Item não encontrado" };
    // Mesma mensagem do não-encontrado de propósito: um dev não deve conseguir
    // sondar quais ids existem no cofre restrito.
    if (user.role !== "gestor" && !data.visible_to_devs)
      return { ok: false as const, error: "Item não encontrado" };
    if (!data.secret_encrypted)
      return { ok: false as const, error: "Esse item não tem conteúdo sensível cadastrado" };

    let secret: string;
    try {
      secret = decryptSecret(data.secret_encrypted as string);
    } catch {
      return {
        ok: false as const,
        error: "Não foi possível decriptar — a chave de criptografia mudou desde que o item foi salvo",
      };
    }

    const { error: auditError } = await supabase.from("credential_vault_access_log").insert({
      credential_id: credentialId,
      user_id: user.id,
      service: data.service as string,
      action: "reveal",
    });
    if (auditError)
      return {
        ok: false as const,
        error: "Revelação bloqueada: não foi possível registrar no log de auditoria",
      };

    return { ok: true as const, secret };
  } catch (e) {
    return { ok: false as const, error: errMessage(e, "Falha ao revelar o conteúdo") };
  }
}

export async function createCredential(
  input: CredentialInput,
): Promise<{ ok: true; credential: CredentialSummary } | { ok: false; error: string }> {
  try {
    const gate = await requireGestor();
    if (!gate.ok) return gate;
    const invalid = validateInput(input);
    if (invalid) return { ok: false as const, error: invalid };

    const secret = input.secret?.trim();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("credential_vault")
      .insert({
        service: input.service.trim(),
        category: input.category?.trim() || null,
        login: input.login?.trim() || null,
        secret_encrypted: secret ? encryptSecret(secret) : null,
        visible_to_devs: input.visibleToDevs,
        url: input.url?.trim() || null,
        notes: input.notes?.trim() || null,
        created_by: gate.userId,
      })
      .select(SUMMARY_COLUMNS)
      .single();
    if (error || !data) return { ok: false as const, error: error?.message ?? "Falha ao criar item" };

    const credential = rowToSummary(data as SummaryRow);
    await logMutation(supabase, {
      credentialId: credential.id,
      userId: gate.userId,
      service: credential.service,
      action: "create",
    });
    return { ok: true as const, credential };
  } catch (e) {
    return { ok: false as const, error: errMessage(e, "Falha ao criar item") };
  }
}

/**
 * Atualiza um item. Semântica do conteúdo sensível:
 * - clearSecret: true  → remove (secret_encrypted = null);
 * - secret com conteúdo real (após trim) → substitui;
 * - vazio/whitespace → mantém o atual. O trim evita o acidente de um espaço
 *   ou Enter no textarea sobrescrever um token de produção com whitespace.
 */
export async function updateCredential(
  credentialId: string,
  input: CredentialInput,
): Promise<
  { ok: true; credential: CredentialSummary; secretChanged: boolean } | { ok: false; error: string }
> {
  try {
    const gate = await requireGestor();
    if (!gate.ok) return gate;
    const invalid = validateInput(input);
    if (invalid) return { ok: false as const, error: invalid };

    const secret = input.secret?.trim();
    const patch: Record<string, unknown> = {
      service: input.service.trim(),
      category: input.category?.trim() || null,
      login: input.login?.trim() || null,
      visible_to_devs: input.visibleToDevs,
      url: input.url?.trim() || null,
      notes: input.notes?.trim() || null,
    };
    let secretChanged = false;
    if (input.clearSecret) {
      patch.secret_encrypted = null;
      secretChanged = true;
    } else if (secret) {
      patch.secret_encrypted = encryptSecret(secret);
      secretChanged = true;
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("credential_vault")
      .update(patch)
      .eq("id", credentialId)
      .select(SUMMARY_COLUMNS)
      .single();
    if (error || !data) return { ok: false as const, error: error?.message ?? "Falha ao atualizar item" };

    const credential = rowToSummary(data as SummaryRow);
    await logMutation(supabase, {
      credentialId,
      userId: gate.userId,
      service: credential.service,
      action: input.clearSecret ? "clear_secret" : "update",
    });
    return { ok: true as const, credential, secretChanged };
  } catch (e) {
    return { ok: false as const, error: errMessage(e, "Falha ao atualizar item") };
  }
}

export async function deleteCredential(
  credentialId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gate = await requireGestor();
    if (!gate.ok) return gate;

    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("credential_vault")
      .select("service")
      .eq("id", credentialId)
      .maybeSingle();

    const { error } = await supabase.from("credential_vault").delete().eq("id", credentialId);
    if (error) return { ok: false as const, error: error.message };

    // Registrado DEPOIS do delete (o FK do log agora é SET NULL, então o
    // histórico de revelações do item sobrevive; esta linha marca o fim dele).
    await logMutation(supabase, {
      credentialId: null,
      userId: gate.userId,
      service: (existing?.service as string) ?? "(desconhecido)",
      action: "delete",
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: errMessage(e, "Falha ao excluir item") };
  }
}
