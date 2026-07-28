// Edge Function: health check do WhatsApp (pg_cron horário).
//
// Vigia DOIS canais, que podem falhar de forma independente:
//   - 'leitura' → instância EVOLUTION_* (collect-groups, summarize-groups);
//   - 'envio'   → instância NOTIFY_*    (relatórios ao grupo).
// Antes daqui só a leitura era checada. Foi por isso que o painel ficou verde
// de 09/07 a 28/07/2026 enquanto nenhum relatório chegava ao grupo: os secrets
// NOTIFY_* apontavam para um servidor Evolution antigo, e ninguém perguntava.
//
// Também verifica se ainda CHEGAM entregas: uma instância pode responder "open"
// e mesmo assim nada sair (destinatário errado, bot removido do grupo). Por isso
// a segunda condição olha notify_deliveries (0068), não só a conexão.
//
// O alerta sai pelo sino in-app (notifications, 0062), NUNCA por WhatsApp — o
// canal quebrado não pode ser o canal do aviso sobre ele mesmo.
//
// Secrets: EVOLUTION_API_URL/KEY/INSTANCE, NOTIFY_API_URL/KEY/INSTANCE, CRON_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
const KEEP_DAYS = 30;
// Janela de tolerância sem entrega bem-sucedida. O ciclo é diário (9h e 19h
// BRT), então 26h cobre um atraso pontual sem deixar passar um dia inteiro.
const STALE_HOURS = 26;

const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").trim().replace(/\/+$/, "");
const EVO_KEY = (Deno.env.get("EVOLUTION_API_KEY") ?? "").trim();
const EVO_INSTANCE = (Deno.env.get("EVOLUTION_INSTANCE") ?? "").trim();
const NOTIFY_URL = (Deno.env.get("NOTIFY_API_URL") ?? "").trim().replace(/\/+$/, "");
const NOTIFY_KEY = (Deno.env.get("NOTIFY_API_KEY") ?? "").trim();
const NOTIFY_INSTANCE = (Deno.env.get("NOTIFY_INSTANCE") ?? "").trim();
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Estado da instância na Evolution. Devolve o texto que vai para o banco. */
async function checkInstance(url: string, key: string, instance: string): Promise<string> {
  if (!url || !key || !instance) return "secrets ausentes";
  try {
    const r = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: key },
    });
    if (!r.ok) return `http ${r.status}`;
    const j = await r.json().catch(() => null);
    return j?.instance?.state ?? j?.state ?? "desconhecido";
  } catch (e) {
    return `erro: ${(e as Error).message.slice(0, 80)}`;
  }
}

function brt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const [leituraState, envioState] = await Promise.all([
    checkInstance(EVO_URL, EVO_KEY, EVO_INSTANCE),
    checkInstance(NOTIFY_URL, NOTIFY_KEY, NOTIFY_INSTANCE),
  ]);
  const leituraOk = leituraState === "open";
  const envioOk = envioState === "open";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: insertError } = await supabase.from("evolution_health_checks").insert([
    { channel: "leitura", state: leituraState, ok: leituraOk },
    { channel: "envio", state: envioState, ok: envioOk },
  ]);
  // higiene: mantém só os últimos KEEP_DAYS dias
  await supabase
    .from("evolution_health_checks")
    .delete()
    .lt("checked_at", new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString());

  // ── Entregas paradas? ──────────────────────────────────────────────────────
  // Só acusa se JÁ EXISTE histórico: num projeto recém-migrado a tabela está
  // vazia e isso não é uma falha, é ausência de dados.
  const { data: lastOk } = await supabase
    .from("notify_deliveries")
    .select("created_at")
    .eq("ok", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: lastAny } = await supabase
    .from("notify_deliveries")
    .select("created_at, type, error")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const staleSince = Date.now() - STALE_HOURS * 3600_000;
  const lastOkAt = lastOk?.created_at ? new Date(lastOk.created_at as string).getTime() : null;
  const stale = lastAny != null && (lastOkAt == null || lastOkAt < staleSince);

  // ── Alerta in-app ──────────────────────────────────────────────────────────
  let notified = 0;
  if (!envioOk || stale) {
    const motivo = !envioOk
      ? `a instância de envio respondeu "${envioState}"`
      : lastOkAt
        ? `nenhuma entrega bem-sucedida desde ${brt(lastOk!.created_at as string)}`
        : "nenhuma entrega bem-sucedida registrada";
    const detalhe = lastAny?.error
      ? ` Último erro (${lastAny.type}): ${String(lastAny.error).slice(0, 180)}.`
      : "";

    const { data: gestores } = await supabase
      .from("app_users")
      .select("id")
      .eq("role", "gestor");

    // dedupe_key por dia: o cron roda de hora em hora e não pode virar spam;
    // se continuar quebrado, no dia seguinte um novo aviso aparece.
    const dia = new Date().toISOString().slice(0, 10);
    const rows = (gestores ?? []).map((g) => ({
      recipient_id: g.id as string,
      type: "whatsapp_envio",
      title: "Relatórios do WhatsApp não estão sendo entregues",
      body: `Os avisos ao grupo pararam: ${motivo}.${detalhe} Confira os secrets NOTIFY_* e a instância na Evolution.`,
      url: "/whatsapp",
      dedupe_key: `notify-down-${dia}-${g.id}`,
    }));
    if (rows.length) {
      const { error: notifyError } = await supabase
        .from("notifications")
        .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (!notifyError) notified = rows.length;
    }
  }

  return Response.json({
    ok: leituraOk && envioOk && !stale,
    leitura: { state: leituraState, ok: leituraOk, instance: EVO_INSTANCE },
    envio: { state: envioState, ok: envioOk, instance: NOTIFY_INSTANCE },
    deliveries: {
      stale,
      lastOkAt: lastOk?.created_at ?? null,
      lastAttemptAt: lastAny?.created_at ?? null,
    },
    notified,
    insertError: insertError?.message ?? null,
  });
});
