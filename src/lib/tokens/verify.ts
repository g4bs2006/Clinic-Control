import { hashApiToken } from "@/lib/auth/api-tokens";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Verificação usada pelas rotas de integração externas (machine-to-machine,
 * sem sessão/cookie). Retorna o dono do token, nunca o token em si.
 */
export async function verifyApiToken(raw: string | null): Promise<{ userId: string } | null> {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, user_id")
    .eq("token_hash", hashApiToken(trimmed))
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;

  // Fire-and-forget: não atrasa a resposta por causa de um UPDATE de telemetria.
  void supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return { userId: data.user_id as string };
}

/**
 * Clínicas do dono do token — direto por `developer_id`, SEM passar por
 * `getCarteiraScope()`. Aquela função tem o branch "gestor vê tudo" via cookie
 * de sessão, que não existe (nem faz sentido) numa chamada máquina-a-máquina:
 * um token sempre escopa só à carteira do próprio dono, mesmo que o dono seja
 * gestor.
 */
export async function clinicIdsOwnedBy(userId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("clinics").select("id").eq("developer_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}
