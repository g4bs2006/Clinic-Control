"use server";

// Testa o acesso externo de uma clínica a um sistema, do lado servidor.
//
// POR QUE EXISTE. Em 2026-08-21 o gate do Aniversariantes foi ao chão em
// produção por um redeploy de build errado, e só apareceu porque alguém testou
// o COMPORTAMENTO em vez de confiar no "Ready" do deploy. Um botão que faz esse
// teste transforma uma verificação que dependia de disciplina em um clique.
//
// O teste do Aniversariantes não é um ping: ele exercita o fluxo inteiro —
// assina o token aqui, segue o redirect, reaproveita o cookie e confere que a
// API devolve EXATAMENTE UMA clínica, a certa. Isso valida três coisas que
// falham de formas diferentes e com o mesmo sintoma:
//   1. o gate está ativo (sem token → 401);
//   2. o segredo daqui bate com o do outro lado (token aceito);
//   3. o escopo funciona (uma clínica, não a lista) — o furo original da #74.

import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { createDashboardsServiceClient } from "@/lib/supabase/dashboards-service";
import { aniversariantesPanelUrl } from "@/lib/clinics/aniversariantes-link";

export type AccessTestStep = {
  label: string;
  ok: boolean;
  detail: string;
};

export type AccessTestResult =
  | { ok: true; steps: AccessTestStep[]; url: string }
  | { ok: false; error: string };

const ANIVERSARIANTES_BASE_URL =
  process.env.ANIVERSARIANTES_BASE_URL ?? "https://aniversariantes-murex.vercel.app";

async function companyIdOf(clinicId: string): Promise<string | null> {
  const cc = createServiceClient();
  const { data } = await cc
    .from("clinic_integrations")
    .select("company_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return (data?.company_id as string | null) ?? null;
}

/**
 * Aniversariantes: gate, segredo compartilhado e escopo, em três passos.
 *
 * Cada passo reporta separado de propósito. "Não abriu" é diagnóstico ruim: o
 * link pode falhar porque o gate caiu, porque o segredo divergiu entre os dois
 * projetos, ou porque o escopo vazou — e as três exigem consertos diferentes.
 */
export async function testAniversariantesAccess(clinicId: string): Promise<AccessTestResult> {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };

  const slug = await companyIdOf(clinicId);
  if (!slug) {
    return {
      ok: false as const,
      error: "Clínica sem company_id da Helena — é o slug que o Aniversariantes usa, não há o que testar.",
    };
  }

  let url: string;
  try {
    url = aniversariantesPanelUrl(ANIVERSARIANTES_BASE_URL, slug);
  } catch (e) {
    // Segredo ausente aqui. Mensagem explícita porque o sintoma do outro lado
    // seria só "acesso não autorizado", sem pista da causa.
    return { ok: false as const, error: (e as Error).message };
  }

  const steps: AccessTestStep[] = [];

  // 1. Sem token, a API tem de recusar. Se responder 200 aqui, o gate caiu — foi
  //    exatamente o que aconteceu no redeploy errado de 21/08.
  try {
    const r = await fetch(`${ANIVERSARIANTES_BASE_URL}/api/clinicas`, { cache: "no-store" });
    steps.push({
      label: "Gate ativo (sem token deve recusar)",
      ok: r.status === 401,
      detail: r.status === 401 ? "401, como esperado" : `respondeu ${r.status} — o gate NÃO está ativo`,
    });
  } catch (e) {
    steps.push({ label: "Gate ativo", ok: false, detail: `falhou ao conectar: ${(e as Error).message}` });
  }

  // 2. O link assinado aqui tem de ser aceito lá: redirect tirando o token da
  //    URL e gravando o cookie. Se der 401, os dois segredos divergiram.
  let cookie: string | null = null;
  try {
    const r = await fetch(url, { redirect: "manual", cache: "no-store" });
    const setCookie = r.headers.get("set-cookie");
    cookie = setCookie?.split(";")[0] ?? null;
    const redirecionou = r.status === 307 || r.status === 302;
    steps.push({
      label: "Token aceito e redirecionado",
      ok: redirecionou && Boolean(cookie),
      detail: redirecionou
        ? cookie
          ? `${r.status} e cookie de escopo gravado`
          : `${r.status}, mas sem cookie — o escopo não persiste`
        : r.status === 401
          ? "401 — o segredo daqui não bate com o do Aniversariantes"
          : `respondeu ${r.status}`,
    });
  } catch (e) {
    steps.push({ label: "Token aceito", ok: false, detail: `falhou: ${(e as Error).message}` });
  }

  // 3. Com o cookie, a API tem de devolver UMA clínica — a desta linha. Este é o
  //    passo que prova o isolamento, o furo original da #74.
  if (cookie) {
    try {
      const r = await fetch(`${ANIVERSARIANTES_BASE_URL}/api/clinicas`, {
        headers: { cookie },
        cache: "no-store",
      });
      const body = (await r.json()) as { clinicas?: { slug: string; nome: string }[] };
      const lista = body.clinicas ?? [];
      const soAMinha = lista.length === 1 && lista[0]?.slug === slug;
      steps.push({
        label: "Escopo restrito a esta clínica",
        ok: r.ok && soAMinha,
        detail: !r.ok
          ? `API respondeu ${r.status}`
          : soAMinha
            ? `devolveu só “${lista[0].nome}”`
            : `devolveu ${lista.length} clínicas — o escopo está vazando`,
      });
    } catch (e) {
      steps.push({ label: "Escopo restrito", ok: false, detail: `falhou: ${(e as Error).message}` });
    }
  }

  return { ok: true as const, steps, url };
}

/**
 * Dashboard: só alcançabilidade. Não há token — o dashboard é aberto por
 * `?clinic=<slug>` e a autorização de lá não é nossa.
 *
 * Exige DASHBOARDS_BASE_URL. Sem ela o teste diz o que falta em vez de fingir
 * que testou: a URL de produção do DashBoard-s vive em secret do GitHub, fora
 * de qualquer repo, então não há default honesto para adotar.
 */
export async function testDashboardAccess(clinicId: string): Promise<AccessTestResult> {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };

  const base = process.env.DASHBOARDS_BASE_URL;
  if (!base) {
    return {
      ok: false as const,
      error:
        "DASHBOARDS_BASE_URL não configurada. A URL de produção do DashBoard-s não está em nenhum repo (vive em secret do GitHub), então não há default para assumir.",
    };
  }

  const slug = await companyIdOf(clinicId);
  if (!slug) {
    return { ok: false as const, error: "Clínica sem company_id da Helena — o dashboard indexa por ele." };
  }

  const url = `${base.replace(/\/$/, "")}/?clinic=${encodeURIComponent(slug)}`;
  const steps: AccessTestStep[] = [];

  try {
    const r = await fetch(url, { cache: "no-store" });
    steps.push({
      label: "Dashboard responde para esta clínica",
      ok: r.ok,
      detail: r.ok ? `${r.status}` : `respondeu ${r.status}`,
    });
  } catch (e) {
    steps.push({ label: "Dashboard responde", ok: false, detail: `falhou: ${(e as Error).message}` });
  }

  return { ok: true as const, steps, url };
}

export type DashboardDiag = {
  exists: boolean;
  hasFunnel: boolean;
  hasDims: boolean;
  hasExtract: boolean;
  clinicorpUnits: number;
  cards: number;
  lastCardAt: string | null;
};

/**
 * Diagnóstico do dashboard daquela clínica — leitura, nunca escrita.
 *
 * Existe porque o wizard ainda vive no `/setup` do DashBoard-s (#70): até ele
 * vir para cá, esta é a única forma de saber POR QUE um dashboard está parcial
 * sem abrir o outro app. `_funnel` ausente com cards entrando é o caso real:
 * coleta rodando e funil vazio na tela do cliente.
 */
export async function getDashboardDiagnostics(
  clinicId: string,
): Promise<{ ok: true; diag: DashboardDiag } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };

  const slug = await companyIdOf(clinicId);
  if (!slug) return { ok: false as const, error: "Clínica sem company_id da Helena." };

  try {
    const db = createDashboardsServiceClient();
    const { data: row } = await db
      .from("clinics")
      .select("steps")
      .eq("account_id", slug)
      .maybeSingle();

    if (!row) {
      return {
        ok: true as const,
        diag: {
          exists: false, hasFunnel: false, hasDims: false, hasExtract: false,
          clinicorpUnits: 0, cards: 0, lastCardAt: null,
        },
      };
    }

    const steps = (row.steps ?? {}) as Record<string, unknown>;
    const clinicorp = steps["_clinicorp"] as { units?: unknown[] } | undefined;

    const { count } = await db
      .from("cards")
      .select("card_id", { count: "exact", head: true })
      .eq("account_id", slug);

    const { data: last } = await db
      .from("cards")
      .select("updated_at")
      .eq("account_id", slug)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ok: true as const,
      diag: {
        exists: true,
        hasFunnel: Object.hasOwn(steps, "_funnel"),
        hasDims: Object.hasOwn(steps, "_dims"),
        hasExtract: Object.hasOwn(steps, "_extract"),
        clinicorpUnits: Array.isArray(clinicorp?.units) ? clinicorp.units.length : 0,
        cards: count ?? 0,
        lastCardAt: (last?.updated_at as string | null) ?? null,
      },
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao ler o dashboard desta clínica",
    };
  }
}
