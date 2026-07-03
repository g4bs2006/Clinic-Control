"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/crypto/token";
import { listCompanies, listCompanyTokens } from "@/lib/helena/admin";
import { listWebhookSubscriptions, listWebhookEvents } from "@/lib/helena/client";
import type { HelenaTokenMeta, HelenaWebhookSubscription } from "@/lib/helena/types";

// Mesmo modelo de auth das demais integration-actions: qualquer usuário
// autenticado é staff interno com acesso total (ver integration-actions.ts).

export type HelenaAccountRow = {
  company_id: string;
  clinic_id: string | null;
  name: string | null;
  legal_name: string | null;
  document_id: string | null;
  email: string | null;
  phone: string | null;
  setup_status: string | null;
  active: boolean;
  config: {
    webhookEnabled?: boolean;
    resources?: Record<string, number>;
  } | null;
  tokens_meta: HelenaTokenMeta[] | null;
  webhooks: HelenaWebhookSubscription[] | null;
  webhooks_error: string | null;
  helena_created_at: string | null;
  synced_at: string;
};

/** Contas sincronizadas (espelho local), ordenadas por nome. */
export async function listHelenaAccounts(): Promise<HelenaAccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("helena_accounts")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HelenaAccountRow[];
}

export type HelenaEventCatalogItem = { event: string; description: string | null };

// O catálogo de eventos é global da Helena (não varia por conta) — cache 1h.
let eventsCache: { value: HelenaEventCatalogItem[]; expires: number } | null = null;

/**
 * Dados de integração Helena de UMA clínica para o perfil: a linha espelhada
 * em helena_accounts (conta, tokens_meta, webhooks) + catálogo de eventos
 * assináveis (ao vivo, com o token da clínica).
 */
export async function getClinicHelenaIntegration(clinicId: string): Promise<
  | { ok: true; account: HelenaAccountRow | null; events: HelenaEventCatalogItem[] }
  | { ok: false; error: string }
> {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false, error: "Não autenticado" };

    const supabase = createServiceClient();
    const { data: account } = await supabase
      .from("helena_accounts")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    let events: HelenaEventCatalogItem[] = [];
    if (eventsCache && eventsCache.expires > Date.now()) {
      events = eventsCache.value;
    } else {
      const { data: integ } = await supabase
        .from("clinic_integrations")
        .select("helena_token_encrypted")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (integ) {
        try {
          const token = decryptToken(integ.helena_token_encrypted as string);
          events = await listWebhookEvents(token);
          eventsCache = { value: events, expires: Date.now() + 60 * 60 * 1000 };
        } catch {
          events = []; // catálogo é cosmético — não derruba o painel
        }
      }
    }

    return { ok: true, account: (account as HelenaAccountRow | null) ?? null, events };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao ler integração Helena" };
  }
}

const PACE_MS = 80; // espaçamento entre contas (rate limit Helena: burst 200/5s)

/**
 * Varre todas as contas do parceiro na Helena e espelha em helena_accounts:
 * dados cadastrais, plano/limites, metadados dos tokens e assinaturas de webhook.
 * Webhooks exigem token da própria conta: usa o token já integrado quando a conta
 * está vinculada a uma clínica; senão tenta os tokens recuperados via master
 * (alguns tokens não têm permissão — registra em webhooks_error).
 */
export async function syncHelenaAccounts(): Promise<
  | { ok: true; total: number; linked: number; webhookErrors: number }
  | { ok: false; error: string }
> {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false, error: "Não autenticado" };

    const masterToken = process.env.HELENA_MASTER_TOKEN;
    if (!masterToken) return { ok: false, error: "HELENA_MASTER_TOKEN não configurado" };

    const supabase = createServiceClient();
    const { data: integrations, error: intError } = await supabase
      .from("clinic_integrations")
      .select("clinic_id, company_id, helena_token_encrypted");
    if (intError) return { ok: false, error: intError.message };

    const integByCompany = new Map(
      (integrations ?? [])
        .filter((i) => i.company_id)
        .map((i) => [i.company_id as string, i]),
    );

    const companies = await listCompanies(masterToken);

    let linked = 0;
    let webhookErrors = 0;
    const syncedIds: string[] = [];

    for (const company of companies) {
      const integ = integByCompany.get(company.id);
      if (integ) linked += 1;

      const tokens = await listCompanyTokens(masterToken, company.id).catch(() => []);

      // Candidatos para ler webhooks: token integrado primeiro, depois os da conta.
      const candidates: string[] = [];
      if (integ) {
        try {
          candidates.push(decryptToken(integ.helena_token_encrypted as string));
        } catch {
          // chave/payload inválido — segue com os tokens recuperados
        }
      }
      candidates.push(...tokens.map((t) => t.token).filter(Boolean));

      let webhooks: HelenaWebhookSubscription[] | null = null;
      let webhooksError: string | null = null;
      for (const candidate of candidates) {
        try {
          webhooks = await listWebhookSubscriptions(candidate);
          webhooksError = null;
          break;
        } catch (e) {
          webhooksError = e instanceof Error ? e.message : "Falha ao listar webhooks";
        }
      }
      if (candidates.length === 0) webhooksError = "Conta sem token de integração";
      if (webhooksError) webhookErrors += 1;

      const { error: upsertError } = await supabase.from("helena_accounts").upsert({
        company_id: company.id,
        clinic_id: (integ?.clinic_id as string) ?? null,
        name: company.name,
        legal_name: company.legalName,
        document_id: company.documentId,
        email: company.email,
        phone: company.phoneNumberFormatted,
        setup_status: company.setupStatus,
        active: company.active,
        config: company.config,
        tokens_meta: tokens.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
        webhooks,
        webhooks_error: webhooksError,
        helena_created_at: company.createdAt,
        synced_at: new Date().toISOString(),
      });
      if (upsertError) return { ok: false, error: upsertError.message };

      syncedIds.push(company.id);
      await new Promise((r) => setTimeout(r, PACE_MS));
    }

    // Remove contas que sumiram da Helena (excluídas/transferidas de parceiro).
    if (syncedIds.length > 0) {
      await supabase
        .from("helena_accounts")
        .delete()
        .not("company_id", "in", `(${syncedIds.join(",")})`);
    }

    revalidatePath("/helena");
    return { ok: true, total: companies.length, linked, webhookErrors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao sincronizar contas" };
  }
}
