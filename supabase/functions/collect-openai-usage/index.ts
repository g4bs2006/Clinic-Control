// Edge Function: coleta diária do consumo OpenAI (tokens + custo USD) por
// projeto -> Supabase. Cada clínica é um projeto na organização OpenAI; o
// vínculo fica em clinics.openai_project_id e o join acontece na leitura.
// Agendada via pg_cron. No fim da coleta avalia os alertas de gasto (limite
// absoluto + anomalia vs média 7d) e cria acompanhamentos.
//
// Secrets: OPENAI_ADMIN_KEY (sk-admin-..., criada em Settings → Organization →
//   Admin Keys), CRON_SECRET. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
//   injetadas automaticamente.
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET> e ?lookbackDays=3
//   (use lookbackDays=30 no primeiro backfill; a Usage API guarda o histórico).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
const OPENAI_BASE = "https://api.openai.com/v1";
// A Usage API pagina por cursor; teto de segurança contra loop infinito.
const MAX_PAGES = 60;

const ADMIN_KEY = (Deno.env.get("OPENAI_ADMIN_KEY") ?? "").trim();
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type UsageRow = {
  project_id: string;
  day: string; // YYYY-MM-DD (UTC — bucket da própria OpenAI)
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

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!ADMIN_KEY) {
    return Response.json({ ok: false, error: "OPENAI_ADMIN_KEY ausente" }, { status: 500 });
  }

  const lookbackDays = Math.max(1, Number(new URL(req.url).searchParams.get("lookbackDays") ?? "3"));
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Janela em dias UTC inteiros: recoletar os últimos N dias com upsert pega a
  // consolidação atrasada da OpenAI (custo do dia fecha com algumas horas de lag).
  const startTime = Math.floor(Date.now() / 1000) - lookbackDays * 86400;

  // 1) Projetos da organização (cache para o select de vínculo na UI).
  const projects: { project_id: string; name: string; status: string | null }[] = [];
  let after: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const json = await openai(`/organization/projects?limit=100${after ? `&after=${after}` : ""}`);
    for (const p of (json.data as Record<string, unknown>[]) ?? []) {
      projects.push({
        project_id: p.id as string,
        name: (p.name as string) ?? p.id as string,
        status: (p.status as string) ?? null,
      });
    }
    if (!json.has_more) break;
    after = (json.last_id as string) ?? null;
    if (!after) break;
  }
  if (projects.length) {
    await supabase
      .from("openai_projects")
      .upsert(projects.map((p) => ({ ...p, synced_at: new Date().toISOString() })), {
        onConflict: "project_id",
      });
  }

  // 2) Tokens (usage/completions) + custo (costs), ambos por dia × projeto.
  const byKey = new Map<string, UsageRow>();
  function row(projectId: string, day: string): UsageRow {
    const k = `${projectId}|${day}`;
    let r = byKey.get(k);
    if (!r) {
      r = { project_id: projectId, day, input_tokens: 0, output_tokens: 0, cached_tokens: 0, requests: 0, cost_usd: 0 };
      byKey.set(k, r);
    }
    return r;
  }

  const usageBuckets = await fetchAllBuckets(
    `/organization/usage/completions?start_time=${startTime}&bucket_width=1d&group_by=project_id&limit=${lookbackDays + 1}`,
  );
  for (const bucket of usageBuckets) {
    const day = dayFromUnix(bucket.start_time as number);
    for (const r of (bucket.results as Record<string, unknown>[]) ?? []) {
      const projectId = r.project_id as string | null;
      if (!projectId) continue;
      const row_ = row(projectId, day);
      row_.input_tokens += (r.input_tokens as number) ?? 0;
      row_.output_tokens += (r.output_tokens as number) ?? 0;
      row_.cached_tokens += (r.input_cached_tokens as number) ?? 0;
      row_.requests += (r.num_model_requests as number) ?? 0;
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
      const amount = (r.amount as { value?: number } | null)?.value ?? 0;
      row(projectId, day).cost_usd += amount;
    }
  }

  // 3) Upsert (merge: re-runs atualizam a consolidação do dia).
  const rows = [...byKey.values()];
  let upserted = 0;
  let upsertErrors = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("clinic_openai_usage")
      .upsert(chunk, { onConflict: "project_id,day", ignoreDuplicates: false });
    if (error) upsertErrors++;
    else upserted += chunk.length;
  }

  // 4) Alertas — avalia o ÚLTIMO dia FECHADO (ontem, UTC). O dia corrente ainda
  // está acumulando e alertaria cedo demais com número parcial.
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
      .select("id, name, developer_id, openai_project_id, openai_daily_limit_usd")
      .not("openai_project_id", "is", null);

    // Histórico dos últimos 8 dias (ontem + 7 anteriores para a média).
    const historyStart = dayFromUnix(Math.floor(Date.now() / 1000) - 9 * 86400);
    const { data: history } = await supabase
      .from("clinic_openai_usage")
      .select("project_id, day, cost_usd")
      .gte("day", historyStart);

    for (const clinic of clinics ?? []) {
      try {
        const mine = (history ?? []).filter((h) => h.project_id === clinic.openai_project_id);
        const todayRow = mine.find((h) => h.day === yesterday);
        const cost = Number(todayRow?.cost_usd ?? 0);
        if (cost < Number(settings.min_cost_usd)) continue;

        const prev = mine.filter((h) => h.day < yesterday).map((h) => Number(h.cost_usd));
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

        // Dedup 1: um alerta por (projeto, dia, tipo) — re-runs do cron não repetem.
        const { data: alertRow, error: alertInsertError } = await supabase
          .from("openai_usage_alerts")
          .insert({
            project_id: clinic.openai_project_id,
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
                `Consumo de ${fmt(cost)} no dia ${yesterday} (UTC), ${motivo}. ` +
                `Verificar no painel da clínica se há contato repetindo em loop ` +
                `(outra IA/operadora) consumindo tokens.`,
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
    usageBuckets: usageBuckets.length,
    costBuckets: costBuckets.length,
    rows: rows.length,
    upserted,
    upsertErrors,
    alertDay: yesterday,
    alerts,
    alertErrors,
  });
});
