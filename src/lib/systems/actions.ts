"use server";

// Colhe os fatos que alimentam a matriz de /sistemas (ADR 0007).
//
// A derivação de estado NÃO mora aqui — ela é pura e vive em ./types.ts, para
// que a matriz e a faixa de status da aba Cadastro usem a mesma regra e para que
// ela seja testável. Aqui é só I/O.
//
// Atravessa três schemas do mesmo projeto Supabase:
//   clinic_control   clinics, clinic_integrations, form_credentials, helena_accounts
//   aniversariantes  aniversariantes_clinicas          (dono: repo Aniversariantes)
//   dashboards       clinics                            (dono: repo DashBoard-s)
//   public           automacao_clinicas                 (consumidor: n8n)
// Ver ADR 0001 e 0006 para por que são schemas separados e o que isso custa.
//
// Uma query por fonte, nunca uma por clínica: com 73 clínicas e 4 sistemas, o
// caminho ingênuo seriam ~300 round-trips.

import { createServiceClient } from "@/lib/supabase/service";
import { createAniversariantesServiceClient } from "@/lib/supabase/aniversariantes-service";
import { createDashboardsServiceClient } from "@/lib/supabase/dashboards-service";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";
import { listAutomacaoClinicasRows } from "@/lib/clinics/automation-projection";
import {
  deriveAll,
  type SystemFacts,
  type SystemsRow,
} from "./types";

type ClinicRow = {
  id: string;
  name: string;
  system: string | null;
  contract_status: string;
};

type IntegRow = {
  clinic_id: string;
  company_id: string | null;
  helena_token_encrypted: string | null;
  automation_enabled: boolean | null;
  automation_scheduled_step_id: string | null;
};

/**
 * Matriz completa: uma linha por clínica no escopo da carteira.
 *
 * `contractStatus` vai na linha em vez de ser filtrado aqui — o filtro é da UI,
 * e ela precisa poder mostrar as arquivadas. Foi assim que apareceu uma clínica
 * arquivada com dashboard ativo e 1.480 cards ainda sendo ingeridos.
 */
export async function listSystemsMatrix(): Promise<
  { ok: true; rows: SystemsRow[] } | { ok: false; error: string }
> {
  try {
    if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
    const { developerFilter } = await getCarteiraScope();

    const cc = createServiceClient();
    let q = cc.from("clinics").select("id, name, system, contract_status").order("name");
    if (developerFilter) q = q.eq("developer_id", developerFilter);
    const { data: clinics, error } = await q;
    if (error) return { ok: false as const, error: error.message };

    const rows = (clinics ?? []) as ClinicRow[];
    if (rows.length === 0) return { ok: true as const, rows: [] };
    const ids = rows.map((c) => c.id);

    const [integRes, credRes, mirror, avSlugs, dashRows] = await Promise.all([
      cc
        .from("clinic_integrations")
        .select("clinic_id, company_id, helena_token_encrypted, automation_enabled, automation_scheduled_step_id")
        .in("clinic_id", ids),
      // Só interessa se EXISTE credencial completa, não qual — o valor fica no
      // painel de provisionamento, que já sabe buscá-lo.
      cc.from("form_credentials").select("clinic_id, token, api_user").in("clinic_id", ids),
      // A tabela do n8n é lida só para apontar divergência, nunca para decidir —
      // mesma postura de listAutomationOverview().
      listAutomacaoClinicasRows().catch(() => []),
      fetchAniversariantesSlugs(),
      fetchDashboards(),
    ]);

    if (integRes.error) return { ok: false as const, error: integRes.error.message };

    const integ = new Map(
      ((integRes.data ?? []) as IntegRow[]).map((i) => [i.clinic_id, i]),
    );
    const credOk = new Set(
      ((credRes.data ?? []) as { clinic_id: string | null; token: string | null; api_user: string | null }[])
        .filter((c) => c.clinic_id && c.token && c.api_user)
        .map((c) => c.clinic_id as string),
    );
    const mirrored = new Set(mirror.map((m) => m.helena_company_id));

    const out: SystemsRow[] = rows.map((c) => {
      const i = integ.get(c.id);
      const companyId = i?.company_id ?? null;
      const dash = companyId ? dashRows.get(companyId) : undefined;

      const facts: SystemFacts = {
        hasIntegrationRow: Boolean(i),
        companyId,
        hasHelenaToken: Boolean(i?.helena_token_encrypted),
        prontuario: c.system,
        automationEnabled: i?.automation_enabled === true,
        automationHasScheduledStep: Boolean(i?.automation_scheduled_step_id),
        automationMirrored: Boolean(companyId && mirrored.has(companyId)),
        aniversariantesProvisioned: Boolean(companyId && avSlugs.has(companyId)),
        hasClinicorpCredential: credOk.has(c.id),
        dashboardExists: Boolean(dash),
        dashboardHasFunnel: Boolean(dash?.hasFunnel),
      };

      const states = deriveAll(facts);
      const hints: SystemsRow["hints"] = {};
      if (states.dashboard === "parcial") hints.dashboard = "sem funil";
      if (states.aniversariantes === "parcial") hints.aniversariantes = "sem credencial";
      if (states.automacao === "parcial") {
        hints.automacao = facts.automationMirrored ? "sem etapa" : "sem espelho no n8n";
      }
      if (states.aniversariantes === "bloqueada" || states.dashboard === "bloqueada") {
        const h = companyId ? "sem token Helena" : "sem company_id";
        if (states.aniversariantes === "bloqueada") hints.aniversariantes = h;
        if (states.dashboard === "bloqueada") hints.dashboard = "sem company_id";
      }

      return {
        clinicId: c.id,
        clinicName: c.name,
        prontuario: c.system,
        contractStatus: c.contract_status,
        states,
        hints,
      };
    });

    return { ok: true as const, rows: out };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao montar a matriz de sistemas",
    };
  }
}

/**
 * Estado dos sistemas de UMA clínica — alimenta a faixa na aba Cadastro.
 *
 * Reusa listSystemsMatrix() de propósito, em vez de repetir as queries: o ADR
 * 0007 aponta a divergência entre as duas telas como a consequência mais
 * provável da decisão, e duas implementações da mesma regra é exatamente como
 * ela apareceria. Custa uma query a mais numa página que já faz várias em
 * paralelo — barato comparado a mostrar dois estados diferentes do mesmo fato.
 */
export async function getClinicSystems(
  clinicId: string,
): Promise<{ ok: true; row: SystemsRow | null } | { ok: false; error: string }> {
  const res = await listSystemsMatrix();
  if (!res.ok) return res;
  return { ok: true as const, row: res.rows.find((r) => r.clinicId === clinicId) ?? null };
}

async function fetchAniversariantesSlugs(): Promise<Set<string>> {
  try {
    const av = createAniversariantesServiceClient();
    const { data } = await av.from("aniversariantes_clinicas").select("slug");
    return new Set(((data ?? []) as { slug: string }[]).map((r) => r.slug));
  } catch {
    // Schema vizinho fora do ar não deve derrubar a matriz inteira — a coluna
    // fica conservadora (nada provisionado) em vez de a página não abrir.
    return new Set();
  }
}

async function fetchDashboards(): Promise<Map<string, { hasFunnel: boolean }>> {
  try {
    const db = createDashboardsServiceClient();
    const { data } = await db.from("clinics").select("account_id, steps");
    const m = new Map<string, { hasFunnel: boolean }>();
    for (const r of (data ?? []) as { account_id: string; steps: unknown }[]) {
      const steps = (r.steps ?? {}) as Record<string, unknown>;
      m.set(r.account_id, { hasFunnel: Object.hasOwn(steps, "_funnel") });
    }
    return m;
  } catch {
    return new Map();
  }
}
