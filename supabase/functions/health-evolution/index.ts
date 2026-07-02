// Edge Function: health check da instância Evolution (pg_cron horário).
// Consulta /instance/connectionState e grava em evolution_health_checks.
// O app mostra um alerta quando o último check não está "open".
//
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, CRON_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
const KEEP_DAYS = 30;

const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").trim().replace(/\/+$/, "");
const EVO_KEY = (Deno.env.get("EVOLUTION_API_KEY") ?? "").trim();
const EVO_INSTANCE = (Deno.env.get("EVOLUTION_INSTANCE") ?? "").trim();
const INST = encodeURIComponent(EVO_INSTANCE);
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let state = "erro";
  try {
    const r = await fetch(`${EVO_URL}/instance/connectionState/${INST}`, {
      headers: { apikey: EVO_KEY },
    });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      state = j?.instance?.state ?? j?.state ?? "desconhecido";
    } else {
      state = `http ${r.status}`;
    }
  } catch (e) {
    state = `erro: ${(e as Error).message.slice(0, 80)}`;
  }

  const ok = state === "open";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("evolution_health_checks").insert({ state, ok });
  // higiene: mantém só os últimos KEEP_DAYS dias
  await supabase
    .from("evolution_health_checks")
    .delete()
    .lt("checked_at", new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString());

  return Response.json({ ok, state, instance: EVO_INSTANCE, insertError: error?.message ?? null });
});
