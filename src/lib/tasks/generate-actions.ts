"use server";

// Geração on-demand de sugestões de tarefa a partir dos grupos de WhatsApp.
// Reusa o pipeline do resumo diário: a Edge Function summarize-groups re-gera
// o resumo de HOJE das clínicas pedidas e o trigger do banco
// (expand_pendencias_to_suggestions) transforma highlights.tarefas em
// task_suggestions, com dedup por pg_trgm + unique. O cliente orquestra em
// lotes pequenos para não estourar o timeout de uma server action.

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";
import { listClinics } from "@/lib/clinics/actions";

export type GenerationScope = {
  /** Clínicas da carteira ativa que têm pelo menos um grupo mapeado. */
  clinics: { id: string; name: string }[];
  /** Clínicas da carteira sem grupo de WhatsApp mapeado (ficam de fora). */
  unmappedCount: number;
};

/** Ids das clínicas visíveis na carteira ativa (null = todas, gestor em "Todas"). */
async function scopedClinicIds(): Promise<string[] | null> {
  const scope = await getCarteiraScope();
  if (!scope.developerFilter) return null;
  const clinics = await listClinics();
  return clinics.filter((c) => c.developer_id === scope.developerFilter).map((c) => c.id);
}

/**
 * Escopo da geração: clínicas ativas da carteira com grupo mapeado. É o que o
 * dialog mostra antes de rodar e a lista que ele fatia em lotes.
 */
export async function getSuggestionGenerationScope(): Promise<
  { ok: true } & GenerationScope | { ok: false; error: string }
> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };
  const supabase = await createClient();

  const [scope, clinics, { data: groups, error }] = await Promise.all([
    getCarteiraScope(),
    listClinics(),
    supabase.from("whatsapp_groups").select("clinic_id").not("clinic_id", "is", null),
  ]);
  if (error) return { ok: false, error: error.message };

  const mapped = new Set((groups ?? []).map((g) => g.clinic_id as string));
  const inScope = clinics.filter(
    (c) =>
      c.contract_status !== "archived" &&
      (!scope.developerFilter || c.developer_id === scope.developerFilter),
  );

  const withGroup = inScope
    .filter((c) => mapped.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { ok: true, clinics: withGroup, unmappedCount: inScope.length - withGroup.length };
}

/**
 * Gera (re-gera) o resumo de hoje para um LOTE de clínicas — o trigger converte
 * as tarefas do resumo em sugestões. Revalida o lote contra a carteira ativa no
 * servidor: o cliente não consegue gerar fora do próprio escopo.
 */
export async function generateSuggestionsForClinics(
  clinicIds: string[],
): Promise<
  | { ok: true; summarized: number; skipped: number; errors: string[] }
  | { ok: false; error: string }
> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };
  if (!clinicIds.length) return { ok: true, summarized: 0, skipped: 0, errors: [] };
  if (clinicIds.length > 10) return { ok: false, error: "Lote grande demais (máx. 10 clínicas)" };

  const allowed = await scopedClinicIds();
  const targets = allowed === null ? clinicIds : clinicIds.filter((id) => allowed.includes(id));
  if (!targets.length) return { ok: false, error: "Clínicas fora da carteira ativa" };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!base || !secret) {
    return { ok: false, error: "Config ausente (NEXT_PUBLIC_SUPABASE_URL / COLLECT_GROUPS_CRON_SECRET)" };
  }

  const url = `${base}/functions/v1/summarize-groups?clinics=${encodeURIComponent(targets.join(","))}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": secret, "content-type": "application/json" },
      body: "{}",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: json?.error ?? `Falha na análise (HTTP ${res.status})` };
    return {
      ok: true,
      summarized: json?.summarized ?? 0,
      skipped: json?.skipped_few_messages ?? 0,
      errors: Array.isArray(json?.errors) ? json.errors : [],
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao contatar a função de resumo" };
  }
}

/**
 * Sugestões pendentes visíveis na carteira ativa — o dialog compara antes ×
 * depois da geração para dizer quantas nasceram de fato (o dedup pode descartar
 * tudo se nada mudou nas conversas).
 */
export async function countPendingSuggestions(): Promise<number> {
  if (!(await getSessionUser())) return 0;
  const supabase = await createClient();
  const clinicIds = await scopedClinicIds();

  let query = supabase
    .from("task_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (clinicIds !== null) {
    if (!clinicIds.length) return 0;
    query = query.in("clinic_id", clinicIds);
  }
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}
