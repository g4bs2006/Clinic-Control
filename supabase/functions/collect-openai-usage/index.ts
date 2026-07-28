// Edge Function: coleta diária do consumo OpenAI por API KEY -> Supabase.
// A organização tem poucos projetos (tudo concentrado no "I.A. Fluxodonto"),
// mas cada clínica tem a própria API key — a key é o identificador da clínica
// (vínculo em clinics.openai_api_key_id, join na leitura).
//
// Tokens por key: /organization/usage/completions com group_by=api_key_id,model.
// Custo por key: ESTIMADO (tokens × preço por modelo) e depois CALIBRADO em duas
// etapas contra /organization/costs agrupado por project_id + line_item:
//   (a) por MODELO — o line_item ("gpt-4.1-2025-04-14, input") dá o custo real
//       de cada modelo, então as linhas daquele modelo são reescaladas para
//       somá-lo. Dentro de um modelo o preço da tabela se cancela e sobra a
//       razão real de tokens entre as clínicas;
//   (b) do DIA — a sobra (whisper/tts/embeddings/file search, invisíveis à
//       usage/completions) é rateada proporcionalmente.
// Resultado: o total por clínica fecha com a fatura E um modelo mal precificado
// não contamina mais o rateio das outras clínicas.
//
// Também mantém as tabelas por projeto da 0053 (openai_projects +
// clinic_openai_usage): são o agregado real e a base da calibração.
//
// Ao alertar, também ENFILEIRA a contenção ativa (0067) e aciona o endpoint
// /api/openai-containment/process no Next, que investiga as conversas e conclui
// os loops. O executor mora lá porque só o Next descriptografa o token Helena.
//
// Secrets: OPENAI_ADMIN_KEY (sk-admin-... com escopos api.usage.read e
//   api.management.read), CRON_SECRET, APP_URL (origem do app no Vercel, p/ o
//   disparo da contenção). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
//   injetadas automaticamente.
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET> e ?lookbackDays=3
//   (use lookbackDays=30 no primeiro backfill; a Usage API guarda o histórico).
//   ?probe=1 = modo diagnóstico, não grava nada.
//   ?keysOnly=1 = só sincroniza o cache de projetos+API keys (para o select de
//   vínculo na UI) e retorna, sem coletar uso/custo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
const OPENAI_BASE = "https://api.openai.com/v1";
// A Usage API pagina por cursor; teto de segurança contra loop infinito.
const MAX_PAGES = 60;

const ADMIN_KEY = (Deno.env.get("OPENAI_ADMIN_KEY") ?? "").trim();
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Preços por 1M tokens (USD). ATENÇÃO ao que estes números são e ao que NÃO são:
// desde a calibração por modelo (ver etapa 4) eles só decidem como o custo real
// de UM modelo se divide entre as keys que o usaram — ou seja, valem apenas
// como PESO RELATIVO entre input/cached/output dentro do mesmo modelo. O nível
// absoluto e a proporção ENTRE modelos vêm do /organization/costs agrupado por
// line_item, não daqui. Consequência prática: um modelo novo que não esteja
// nesta lista não distorce mais o rateio entre clínicas (era o bug do
// gpt-5.2, que caía no perfil "mini" e subestimava a clínica em ~5×).
// Prefixos mais específicos primeiro (match por startsWith).
const MODEL_PRICES: [string, { input: number; cached: number; output: number }][] = [
  ["gpt-5.4-mini", { input: 0.25, cached: 0.025, output: 2 }],
  ["gpt-5.4-nano", { input: 0.05, cached: 0.005, output: 0.4 }],
  ["gpt-5.4", { input: 1.25, cached: 0.125, output: 10 }],
  ["gpt-5.3-mini", { input: 0.25, cached: 0.025, output: 2 }],
  ["gpt-5.3", { input: 1.25, cached: 0.125, output: 10 }],
  ["gpt-5.2-mini", { input: 0.25, cached: 0.025, output: 2 }],
  ["gpt-5.2", { input: 1.25, cached: 0.125, output: 10 }],
  ["gpt-5-mini", { input: 0.25, cached: 0.025, output: 2 }],
  ["gpt-5-nano", { input: 0.05, cached: 0.005, output: 0.4 }],
  ["gpt-5", { input: 1.25, cached: 0.125, output: 10 }],
  ["gpt-4.1-mini", { input: 0.4, cached: 0.1, output: 1.6 }],
  ["gpt-4.1-nano", { input: 0.1, cached: 0.025, output: 0.4 }],
  ["gpt-4.1", { input: 2, cached: 0.5, output: 8 }],
  ["gpt-4o-mini", { input: 0.15, cached: 0.075, output: 0.6 }],
  ["gpt-4o", { input: 2.5, cached: 1.25, output: 10 }],
];
const DEFAULT_PRICE = { input: 1.25, cached: 0.125, output: 10 }; // perfil full-tier

// Modelos sem preço próprio caem no DEFAULT. Isso deixou de distorcer o rateio
// (a calibração por modelo corrige), mas ainda vale saber que aconteceu — o
// nome vai no JSON de retorno em `unpricedModels` para entrar na lista acima.
const unpricedModels = new Set<string>();

function priceFor(model: string): { input: number; cached: number; output: number } {
  for (const [prefix, price] of MODEL_PRICES) {
    if (model.startsWith(prefix)) return price;
  }
  if (model) unpricedModels.add(model);
  return DEFAULT_PRICE;
}

// line_item do /organization/costs → nome do modelo. Formatos observados:
//   "gpt-4.1-2025-04-14, input"        → gpt-4.1-2025-04-14
//   "evals | gpt-4o-mini-..., output"  → gpt-4o-mini-...
//   "assistants api | file search"     → null (não é consumo de modelo)
// A parte após a vírgula (input/output/cached input) é descartada: calibramos
// o modelo inteiro de uma vez e deixamos a divisão input/output para os pesos
// de MODEL_PRICES.
function modelFromLineItem(lineItem: string): string | null {
  const afterPipe = lineItem.includes("|")
    ? lineItem.slice(lineItem.lastIndexOf("|") + 1)
    : lineItem;
  const comma = afterPipe.lastIndexOf(",");
  if (comma < 0) return null; // sem ", input"/", output" não é linha de modelo
  const model = afterPipe.slice(0, comma).trim().replace(/^ft-/, "");
  return model || null;
}

type KeyUsageRow = {
  api_key_id: string;
  day: string; // YYYY-MM-DD (UTC — bucket da própria OpenAI)
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  requests: number;
  est_cost_usd: number;
};

type ProjectUsageRow = {
  project_id: string;
  day: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  requests: number;
  cost_usd: number;
};

function dayFromUnix(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function openai(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${OPENAI_BASE}${path}`, {
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status} em ${path.split("?")[0]}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Varre todas as páginas de um endpoint de usage/costs (cursor em next_page).
async function fetchAllBuckets(basePath: string): Promise<Record<string, unknown>[]> {
  const buckets: Record<string, unknown>[] = [];
  let page: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const json = await openai(page ? `${basePath}&page=${encodeURIComponent(page)}` : basePath);
    buckets.push(...((json.data as Record<string, unknown>[]) ?? []));
    if (!json.has_more) return buckets;
    page = (json.next_page as string) ?? null;
    if (!page) return buckets;
  }
  throw new Error(`paginação excedeu ${MAX_PAGES} páginas em ${basePath.split("?")[0]}`);
}

// Lista paginada de recursos administrativos (projects, api_keys) — cursor em last_id.
async function fetchAllAdmin(basePath: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const json = await openai(`${basePath}${sep}limit=100${after ? `&after=${after}` : ""}`);
    items.push(...((json.data as Record<string, unknown>[]) ?? []));
    if (!json.has_more) return items;
    after = (json.last_id as string) ?? null;
    if (!after) return items;
  }
  throw new Error(`paginação excedeu ${MAX_PAGES} páginas em ${basePath.split("?")[0]}`);
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!ADMIN_KEY) {
    return Response.json({ ok: false, error: "OPENAI_ADMIN_KEY ausente" }, { status: 500 });
  }
  try {
    return await run(req);
  } catch (err) {
    // Erro vira JSON legível (aparece no net._http_response do cron) em vez de
    // um 500 opaco do runtime.
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});

async function run(req: Request): Promise<Response> {
  // Modo diagnóstico: ?probe=1 lista projetos, API keys por projeto e uma
  // amostra de usage agrupada por api_key_id+model, sem gravar nada.
  if (new URL(req.url).searchParams.get("probe") === "1") {
    const projects = (await fetchAllAdmin(`/organization/projects`)).map((p) => ({
      id: p.id as string,
      name: p.name as string,
    }));
    const keys: Record<string, unknown>[] = [];
    for (const p of projects) {
      for (const k of await fetchAllAdmin(`/organization/projects/${p.id}/api_keys`)) {
        keys.push({ project: p.name, id: k.id, name: k.name, redacted: k.redacted_value });
      }
    }
    const st = Math.floor(Date.now() / 1000) - 2 * 86400;
    const uj = await openai(
      `/organization/usage/completions?start_time=${st}&bucket_width=1d&group_by=api_key_id,model&limit=3`,
    );
    const usageSample = ((uj.data as Record<string, unknown>[]) ?? []).map((b) => ({
      start_time: b.start_time,
      results: ((b.results as Record<string, unknown>[]) ?? []).slice(0, 15),
      total_results: ((b.results as Record<string, unknown>[]) ?? []).length,
    }));
    // Amostra dos line_items de custo: confirma que o group_by=line_item está
    // sendo respeitado (se vier sem o campo, a calibração por modelo degrada
    // sozinha para o rateio proporcional antigo — ver etapa 4).
    const cj = await openai(
      `/organization/costs?start_time=${st}&bucket_width=1d&group_by=project_id,line_item&limit=2`,
    );
    const costSample = ((cj.data as Record<string, unknown>[]) ?? []).map((b) => ({
      start_time: b.start_time,
      results: ((b.results as Record<string, unknown>[]) ?? []).slice(0, 20),
    }));
    return Response.json({
      ok: true,
      probe: true,
      projects,
      keyCount: keys.length,
      keys,
      usageSample,
      costSample,
    });
  }

  // O isolate é reaproveitado entre invocações; sem o reset o diagnóstico
  // acumularia modelos de execuções anteriores.
  unpricedModels.clear();

  const lookbackDays = Math.max(1, Number(new URL(req.url).searchParams.get("lookbackDays") ?? "3"));
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Janela em dias UTC inteiros: recoletar os últimos N dias com upsert pega a
  // consolidação atrasada da OpenAI (custo do dia fecha com algumas horas de lag).
  const startTime = Math.floor(Date.now() / 1000) - lookbackDays * 86400;

  // 1) Projetos + API keys da organização (cache para o select de vínculo na UI).
  const projects = (await fetchAllAdmin(`/organization/projects`)).map((p) => ({
    project_id: p.id as string,
    name: ((p.name as string) ?? p.id) as string,
    status: (p.status as string) ?? null,
  }));
  if (projects.length) {
    await supabase
      .from("openai_projects")
      .upsert(projects.map((p) => ({ ...p, synced_at: new Date().toISOString() })), {
        onConflict: "project_id",
      });
  }

  const apiKeys: { api_key_id: string; name: string; redacted_value: string | null; project_id: string }[] = [];
  for (const p of projects) {
    for (const k of await fetchAllAdmin(`/organization/projects/${p.project_id}/api_keys`)) {
      apiKeys.push({
        api_key_id: k.id as string,
        name: ((k.name as string) ?? k.id) as string,
        redacted_value: (k.redacted_value as string) ?? null,
        project_id: p.project_id,
      });
    }
  }
  if (apiKeys.length) {
    await supabase
      .from("openai_api_keys")
      .upsert(apiKeys.map((k) => ({ ...k, synced_at: new Date().toISOString() })), {
        onConflict: "api_key_id",
      });
  }

  // Modo "só chaves": ?keysOnly=1 sincroniza apenas o cache de projetos+API keys
  // (para o select de vínculo na UI) e retorna, sem coletar uso/custo. Usado pelo
  // botão "Sincronizar chaves agora" — uma clínica/chave nova aparece no select
  // na hora, sem esperar o cron diário.
  if (new URL(req.url).searchParams.get("keysOnly") === "1") {
    return Response.json({ ok: true, keysOnly: true, projects: projects.length, apiKeys: apiKeys.length });
  }

  // 2) Uso por API key × modelo (tokens) com custo estimado pela tabela de preços.
  const keyRows = new Map<string, KeyUsageRow>();
  const usageBuckets = await fetchAllBuckets(
    `/organization/usage/completions?start_time=${startTime}&bucket_width=1d&group_by=api_key_id,model&limit=${lookbackDays + 1}`,
  );
  for (const bucket of usageBuckets) {
    const day = dayFromUnix(bucket.start_time as number);
    for (const r of (bucket.results as Record<string, unknown>[]) ?? []) {
      const apiKeyId = r.api_key_id as string | null;
      if (!apiKeyId) continue;
      const model = ((r.model as string) ?? "") as string;
      const mapKey = `${apiKeyId}|${day}|${model}`;
      let row = keyRows.get(mapKey);
      if (!row) {
        row = {
          api_key_id: apiKeyId,
          day,
          model,
          input_tokens: 0,
          output_tokens: 0,
          cached_tokens: 0,
          requests: 0,
          est_cost_usd: 0,
        };
        keyRows.set(mapKey, row);
      }
      row.input_tokens += Number(r.input_tokens ?? 0) || 0;
      row.output_tokens += Number(r.output_tokens ?? 0) || 0;
      row.cached_tokens += Number(r.input_cached_tokens ?? 0) || 0;
      row.requests += Number(r.num_model_requests ?? 0) || 0;
    }
  }
  for (const row of keyRows.values()) {
    const price = priceFor(row.model);
    const uncached = Math.max(0, row.input_tokens - row.cached_tokens);
    row.est_cost_usd =
      (uncached / 1_000_000) * price.input +
      (row.cached_tokens / 1_000_000) * price.cached +
      (row.output_tokens / 1_000_000) * price.output;
  }

  // 3) Agregado por PROJETO (tokens + custo REAL) — mantém a 0053 viva e dá a
  // base da calibração.
  const projRows = new Map<string, ProjectUsageRow>();
  function projRow(projectId: string, day: string): ProjectUsageRow {
    const k = `${projectId}|${day}`;
    let r = projRows.get(k);
    if (!r) {
      r = { project_id: projectId, day, input_tokens: 0, output_tokens: 0, cached_tokens: 0, requests: 0, cost_usd: 0 };
      projRows.set(k, r);
    }
    return r;
  }
  const projUsageBuckets = await fetchAllBuckets(
    `/organization/usage/completions?start_time=${startTime}&bucket_width=1d&group_by=project_id&limit=${lookbackDays + 1}`,
  );
  for (const bucket of projUsageBuckets) {
    const day = dayFromUnix(bucket.start_time as number);
    for (const r of (bucket.results as Record<string, unknown>[]) ?? []) {
      const projectId = r.project_id as string | null;
      if (!projectId) continue;
      const row = projRow(projectId, day);
      row.input_tokens += Number(r.input_tokens ?? 0) || 0;
      row.output_tokens += Number(r.output_tokens ?? 0) || 0;
      row.cached_tokens += Number(r.input_cached_tokens ?? 0) || 0;
      row.requests += Number(r.num_model_requests ?? 0) || 0;
    }
  }
  // group_by=project_id,line_item traz o custo REAL quebrado por modelo
  // ("gpt-4.1-2025-04-14, input") além do projeto — é o insumo da calibração
  // fina da etapa 4. Somando os line_items de um projeto/dia obtemos o mesmo
  // total que o group_by=project_id sozinho dava antes.
  const realByDayModel = new Map<string, number>(); // "dia|modelo" → US$ real
  const realTotalByDay = new Map<string, number>();
  const costBuckets = await fetchAllBuckets(
    // Vírgula, não parâmetro repetido — é a forma que a Usage API já aceita no
    // group_by=api_key_id,model da etapa 2.
    `/organization/costs?start_time=${startTime}&bucket_width=1d&group_by=project_id,line_item&limit=${lookbackDays + 1}`,
  );
  for (const bucket of costBuckets) {
    const day = dayFromUnix(bucket.start_time as number);
    for (const r of (bucket.results as Record<string, unknown>[]) ?? []) {
      // amount.value chega como STRING na API de costs — sem Number() o +=
      // vira concatenação e a calibração quebra (real deixa de ser > 0).
      const amount = Number((r.amount as { value?: number | string } | null)?.value ?? 0) || 0;
      const projectId = r.project_id as string | null;
      if (projectId) projRow(projectId, day).cost_usd += amount;
      realTotalByDay.set(day, (realTotalByDay.get(day) ?? 0) + amount);

      const model = modelFromLineItem((r.line_item as string) ?? "");
      if (model) {
        const k = `${day}|${model}`;
        realByDayModel.set(k, (realByDayModel.get(k) ?? 0) + amount);
      }
    }
  }

  // 4) Calibração em duas etapas.
  //
  // 4a) POR MODELO: para cada (dia, modelo) com custo real conhecido via
  // line_item, reescala as linhas daquele modelo para somarem exatamente esse
  // valor. Como todas as keys de um mesmo modelo compartilham o mesmo preço,
  // aqui o preço da tabela se cancela e o que sobra é a razão real de tokens
  // entre as clínicas. É isso que impede um modelo mal precificado de roubar
  // gasto das outras clínicas — o erro fica confinado ao próprio modelo.
  //
  // 4b) RECONCILIAÇÃO DO DIA: o que sobrar entre o total real do dia e a soma
  // já calibrada (whisper/tts/embeddings/file search, que a usage/completions
  // não enxerga, mais qualquer modelo sem line_item correspondente) é rateado
  // proporcionalmente sobre todas as linhas do dia — vira "participação no
  // gasto", e garante que a soma por clínica feche com a fatura.
  //
  // Dia sem custo real ainda (lag de consolidação) fica com a estimativa crua;
  // o re-upsert do cron seguinte corrige.
  const estByDayModel = new Map<string, number>();
  const estRawByDay = new Map<string, number>(); // estimativa crua, só p/ o debug
  for (const r of keyRows.values()) {
    const k = `${r.day}|${r.model}`;
    estByDayModel.set(k, (estByDayModel.get(k) ?? 0) + r.est_cost_usd);
    estRawByDay.set(r.day, (estRawByDay.get(r.day) ?? 0) + r.est_cost_usd);
  }

  const modelsCalibrated = new Set<string>();
  const modelsWithoutCost = new Set<string>();
  for (const row of keyRows.values()) {
    const k = `${row.day}|${row.model}`;
    const real = realByDayModel.get(k);
    const est = estByDayModel.get(k) ?? 0;
    if (real !== undefined && real > 0 && est > 0) {
      row.est_cost_usd = row.est_cost_usd * (real / est);
      modelsCalibrated.add(row.model);
    } else if (row.model) {
      modelsWithoutCost.add(row.model);
    }
  }

  // 4b) sobra do dia, rateada proporcionalmente.
  const afterModelByDay = new Map<string, number>();
  for (const r of keyRows.values()) {
    afterModelByDay.set(r.day, (afterModelByDay.get(r.day) ?? 0) + r.est_cost_usd);
  }
  const calibDebug: Record<
    string,
    { real: number; est: number; afterModel: number; leftover: number; factor: number | null }
  > = {};
  for (const [day, afterModel] of afterModelByDay) {
    const real = realTotalByDay.get(day) ?? 0;
    const leftover = real - afterModel;
    calibDebug[day] = {
      real,
      est: estRawByDay.get(day) ?? 0,
      afterModel,
      leftover,
      factor: real > 0 && afterModel > 0 ? real / afterModel : null,
    };
  }
  for (const row of keyRows.values()) {
    const real = realTotalByDay.get(row.day) ?? 0;
    const afterModel = afterModelByDay.get(row.day) ?? 0;
    if (real > 0 && afterModel > 0) row.est_cost_usd = row.est_cost_usd * (real / afterModel);
  }

  // 4c) Keys vistas no uso mas ausentes do admin listing: a key foi DELETADA na
  // OpenAI depois de gastar. Sem um stub aqui ela nunca ganha nome nem aparece
  // no select de vínculo, e o gasto some da UI mesmo continuando na fatura —
  // foi assim que US$ 632 de julho/2026 ficaram invisíveis. O stub é criado uma
  // vez e nunca sobrescreve uma key real (ignoreDuplicates).
  const knownKeyIds = new Set(apiKeys.map((k) => k.api_key_id));
  const orphanKeyIds = [...new Set([...keyRows.values()].map((r) => r.api_key_id))].filter(
    (id) => !knownKeyIds.has(id),
  );
  if (orphanKeyIds.length) {
    await supabase.from("openai_api_keys").upsert(
      orphanKeyIds.map((id) => ({
        api_key_id: id,
        name: `(key removida da OpenAI · ${id.slice(0, 12)}…)`,
        redacted_value: null,
        project_id: null,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "api_key_id", ignoreDuplicates: true },
    );
  }

  // 5) Upserts (merge: re-runs atualizam a consolidação do dia).
  let upserted = 0;
  let upsertErrors = 0;
  const keyRowsArr = [...keyRows.values()];
  for (let i = 0; i < keyRowsArr.length; i += 500) {
    const chunk = keyRowsArr.slice(i, i + 500);
    const { error } = await supabase
      .from("openai_key_usage")
      .upsert(chunk, { onConflict: "api_key_id,day,model", ignoreDuplicates: false });
    if (error) upsertErrors++;
    else upserted += chunk.length;
  }
  const projRowsArr = [...projRows.values()];
  for (let i = 0; i < projRowsArr.length; i += 500) {
    const chunk = projRowsArr.slice(i, i + 500);
    const { error } = await supabase
      .from("clinic_openai_usage")
      .upsert(chunk, { onConflict: "project_id,day", ignoreDuplicates: false });
    if (error) upsertErrors++;
    else upserted += chunk.length;
  }

  // 6) Alertas — avalia o ÚLTIMO dia FECHADO (ontem, UTC) sobre o custo
  // estimado por key. O dia corrente ainda está acumulando e alertaria cedo
  // demais com número parcial.
  const yesterday = dayFromUnix(Math.floor(Date.now() / 1000) - 86400);
  const alerts: { clinic: string; kind: string; cost: number }[] = [];
  let alertErrors = 0;
  let queuedRuns = 0;

  const { data: settings } = await supabase
    .from("openai_alert_settings")
    .select("enabled, daily_limit_usd, spike_multiplier, min_cost_usd")
    .eq("id", true)
    .maybeSingle();

  if (settings?.enabled) {
    const { data: clinics } = await supabase
      .from("clinics")
      .select("id, name, developer_id, openai_api_key_id, openai_daily_limit_usd")
      .not("openai_api_key_id", "is", null);

    // Histórico dos últimos 8 dias (ontem + 7 anteriores para a média), somado
    // por (key, dia) — o modelo não importa para o alerta.
    const historyStart = dayFromUnix(Math.floor(Date.now() / 1000) - 9 * 86400);
    const { data: history } = await supabase
      .from("openai_key_usage")
      .select("api_key_id, day, est_cost_usd")
      .gte("day", historyStart);
    const costByKeyDay = new Map<string, number>();
    for (const h of history ?? []) {
      const k = `${h.api_key_id}|${h.day}`;
      costByKeyDay.set(k, (costByKeyDay.get(k) ?? 0) + Number(h.est_cost_usd));
    }

    for (const clinic of clinics ?? []) {
      try {
        const keyId = clinic.openai_api_key_id as string;
        const cost = costByKeyDay.get(`${keyId}|${yesterday}`) ?? 0;
        if (cost < Number(settings.min_cost_usd)) continue;

        const prev: number[] = [];
        for (const [k, v] of costByKeyDay) {
          const [id, day] = k.split("|");
          if (id === keyId && day < yesterday) prev.push(v);
        }
        const avg7 = prev.length ? prev.reduce((s, v) => s + v, 0) / prev.length : null;

        const limit = Number(clinic.openai_daily_limit_usd ?? settings.daily_limit_usd);
        let kind: "limite" | "anomalia" | null = null;
        let threshold = limit;
        if (cost > limit) {
          kind = "limite";
        } else if (avg7 !== null && prev.length >= 3 && cost > avg7 * Number(settings.spike_multiplier)) {
          kind = "anomalia";
          threshold = avg7 * Number(settings.spike_multiplier);
        }
        if (!kind) continue;

        // Dedup 1: um alerta por (key, dia, tipo) — re-runs do cron não repetem
        // (unique parcial openai_usage_alerts_key_day_kind).
        const { data: alertRow, error: alertInsertError } = await supabase
          .from("openai_usage_alerts")
          .insert({
            api_key_id: keyId,
            clinic_id: clinic.id,
            day: yesterday,
            kind,
            cost_usd: cost,
            threshold_usd: threshold,
          })
          .select("id")
          .single();
        if (alertInsertError) continue; // unique violado = já alertado hoje

        // Dedup 2 (episódio): pico que dura vários dias não empilha um
        // acompanhamento por dia — reaproveita o que ainda está aberto.
        const { data: openExisting } = await supabase
          .from("acompanhamentos")
          .select("id")
          .eq("clinic_id", clinic.id)
          .eq("status", "aberto")
          .like("title", "Gasto OpenAI alto%")
          .limit(1)
          .maybeSingle();

        let acompanhamentoId = openExisting?.id ?? null;
        if (!acompanhamentoId) {
          const fmt = (v: number) => `US$ ${v.toFixed(2)}`;
          const motivo =
            kind === "limite"
              ? `acima do limite diário de ${fmt(limit)}`
              : `${(cost / (avg7 || 1)).toFixed(1)}× a média dos 7 dias anteriores (${fmt(avg7 ?? 0)}/dia)`;
          const { data: created } = await supabase
            .from("acompanhamentos")
            .insert({
              clinic_id: clinic.id,
              title: `Gasto OpenAI alto — ${fmt(cost)} em ${yesterday}`,
              description:
                `Consumo estimado de ${fmt(cost)} no dia ${yesterday} (UTC), ${motivo}. ` +
                `Use o botão "Investigar contatos" no painel Consumo de IA da clínica ` +
                `para ranquear quem está consumindo tokens (outra IA/operadora/loop).`,
              severity: "alta",
              assigned_to: clinic.developer_id,
              source: "ia",
            })
            .select("id")
            .single();
          acompanhamentoId = created?.id ?? null;
        }
        if (acompanhamentoId) {
          await supabase
            .from("openai_usage_alerts")
            .update({ acompanhamento_id: acompanhamentoId })
            .eq("id", alertRow.id);
        }

        // Contenção ativa: enfileira a rodada que vai investigar as conversas e
        // concluir os loops. O unique (clinic_id, day) faz o dedup — re-runs do
        // cron no mesmo dia não enfileiram de novo. A execução em si é do Next
        // (0067), que é onde o token Helena pode ser descriptografado.
        const { error: queueError } = await supabase.from("openai_containment_runs").insert({
          clinic_id: clinic.id,
          alert_id: alertRow.id,
          day: yesterday,
          cost_usd: cost,
        });
        if (!queueError) queuedRuns += 1;

        alerts.push({ clinic: clinic.name as string, kind, cost });
      } catch {
        alertErrors++;
      }
    }
  }

  // Dispara a contenção no Next. Fire-and-forget com timeout curto: basta a
  // request chegar, o handler segue mesmo se abortarmos, e ele encadeia o resto
  // da fila sozinho. Se a chamada se perder, os runs ficam 'na fila' e a rodada
  // de amanhã (ou o botão na UI) retoma — nada é perdido.
  let containmentDispatch: string | null = null;
  if (queuedRuns > 0) {
    const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
    if (!appUrl) {
      containmentDispatch = "APP_URL ausente — runs enfileirados, mas ninguém foi acionado";
    } else {
      try {
        await fetch(`${appUrl}/api/openai-containment/process`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-cron-secret": CRON_SECRET },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(3_000),
        });
        containmentDispatch = "disparado";
      } catch (e) {
        // TimeoutError é o caminho ESPERADO aqui (não esperamos a resposta).
        containmentDispatch =
          (e as Error)?.name === "TimeoutError" ? "disparado (timeout esperado)" : `falhou: ${e}`;
      }
    }
  }

  return Response.json({
    ok: true,
    lookbackDays,
    projects: projects.length,
    apiKeys: apiKeys.length,
    keyUsageRows: keyRowsArr.length,
    projectUsageRows: projRowsArr.length,
    upserted,
    upsertErrors,
    alertDay: yesterday,
    alerts,
    alertErrors,
    queuedRuns,
    containmentDispatch,
    calibDebug,
    // Observabilidade da calibração — antes isso falhava em silêncio:
    //   unpricedModels     → sem preço em MODEL_PRICES (adicione lá)
    //   modelsWithoutCost  → sem line_item correspondente em /costs; caem só na
    //                        reconciliação proporcional, rateio menos preciso
    //   orphanKeys         → gastaram mas não existem mais na OpenAI
    unpricedModels: [...unpricedModels],
    modelsCalibrated: [...modelsCalibrated],
    modelsWithoutCost: [...modelsWithoutCost],
    orphanKeys: orphanKeyIds,
  });
}
