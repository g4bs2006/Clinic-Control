// Edge Function: coleta diária do consumo OpenAI por API KEY -> Supabase.
// A organização tem poucos projetos (tudo concentrado no "I.A. Fluxodonto"),
// mas cada clínica tem a própria API key — a key é o identificador da clínica
// (vínculo em clinics.openai_api_key_id, join na leitura).
//
// Tokens por key: /organization/usage/completions com group_by=api_key_id,model.
// Custo por key: ESTIMADO (tokens × preço por modelo) e depois CALIBRADO por dia
// para a soma bater com o custo real de /organization/costs (que só quebra por
// projeto). Assim o rateio por clínica soma exatamente a fatura do dia.
//
// Também mantém as tabelas por projeto da 0053 (openai_projects +
// clinic_openai_usage): são o agregado real e a base da calibração.
//
// Secrets: OPENAI_ADMIN_KEY (sk-admin-... com escopos api.usage.read e
//   api.management.read), CRON_SECRET. SUPABASE_URL e
//   SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente.
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET> e ?lookbackDays=3
//   (use lookbackDays=30 no primeiro backfill; a Usage API guarda o histórico).
//   ?probe=1 = modo diagnóstico, não grava nada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
const OPENAI_BASE = "https://api.openai.com/v1";
// A Usage API pagina por cursor; teto de segurança contra loop infinito.
const MAX_PAGES = 60;

const ADMIN_KEY = (Deno.env.get("OPENAI_ADMIN_KEY") ?? "").trim();
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Preços por 1M tokens (USD) — pesos da calibração, não a fatura final: o
// rateio é reescalado para somar o custo real do dia, então errar o valor
// absoluto pouco importa, errar a PROPORÇÃO entre modelos importa. Prefixos
// mais específicos primeiro (match por startsWith).
const MODEL_PRICES: [string, { input: number; cached: number; output: number }][] = [
  ["gpt-5.4-mini", { input: 0.25, cached: 0.025, output: 2 }],
  ["gpt-5.4-nano", { input: 0.05, cached: 0.005, output: 0.4 }],
  ["gpt-5.4", { input: 1.25, cached: 0.125, output: 10 }],
  ["gpt-5-mini", { input: 0.25, cached: 0.025, output: 2 }],
  ["gpt-5-nano", { input: 0.05, cached: 0.005, output: 0.4 }],
  ["gpt-5", { input: 1.25, cached: 0.125, output: 10 }],
  ["gpt-4.1-mini", { input: 0.4, cached: 0.1, output: 1.6 }],
  ["gpt-4.1-nano", { input: 0.1, cached: 0.025, output: 0.4 }],
  ["gpt-4.1", { input: 2, cached: 0.5, output: 8 }],
  ["gpt-4o-mini", { input: 0.15, cached: 0.075, output: 0.6 }],
  ["gpt-4o", { input: 2.5, cached: 1.25, output: 10 }],
];
const DEFAULT_PRICE = { input: 0.25, cached: 0.025, output: 2 }; // perfil "mini"

function priceFor(model: string): { input: number; cached: number; output: number } {
  for (const [prefix, price] of MODEL_PRICES) {
    if (model.startsWith(prefix)) return price;
  }
  return DEFAULT_PRICE;
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
    return Response.json({ ok: true, probe: true, projects, keyCount: keys.length, keys, usageSample });
  }

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
  const costBuckets = await fetchAllBuckets(
    `/organization/costs?start_time=${startTime}&bucket_width=1d&group_by=project_id&limit=${lookbackDays + 1}`,
  );
  for (const bucket of costBuckets) {
    const day = dayFromUnix(bucket.start_time as number);
    for (const r of (bucket.results as Record<string, unknown>[]) ?? []) {
      const projectId = r.project_id as string | null;
      if (!projectId) continue;
      // amount.value chega como STRING na API de costs — sem Number() o +=
      // vira concatenação e a calibração quebra (real deixa de ser > 0).
      const amount = Number((r.amount as { value?: number | string } | null)?.value ?? 0) || 0;
      projRow(projectId, day).cost_usd += amount;
    }
  }

  // 4) Calibração: reescala a estimativa de cada (key, dia, modelo) para que a
  // soma do dia bata com o custo real do dia inteiro (todas as fontes — inclui
  // whisper/tts/embeddings que a usage/completions não vê; o rateio vira
  // "participação no gasto"). Dia sem custo real ainda (lag) fica com a
  // estimativa crua; o re-upsert do cron seguinte corrige.
  const realByDay = new Map<string, number>();
  for (const r of projRows.values()) {
    realByDay.set(r.day, (realByDay.get(r.day) ?? 0) + r.cost_usd);
  }
  const estByDay = new Map<string, number>();
  for (const r of keyRows.values()) {
    estByDay.set(r.day, (estByDay.get(r.day) ?? 0) + r.est_cost_usd);
  }
  const calibDebug: Record<string, { real: number; est: number; factor: number | null }> = {};
  for (const [day, est] of estByDay) {
    const real = realByDay.get(day) ?? 0;
    calibDebug[day] = { real, est, factor: real > 0 && est > 0 ? real / est : null };
  }
  for (const row of keyRows.values()) {
    const real = realByDay.get(row.day) ?? 0;
    const est = estByDay.get(row.day) ?? 0;
    if (real > 0 && est > 0) row.est_cost_usd = row.est_cost_usd * (real / est);
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
        alerts.push({ clinic: clinic.name as string, kind, cost });
      } catch {
        alertErrors++;
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
    calibDebug,
  });
}
