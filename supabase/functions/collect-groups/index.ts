// Edge Function: coleta diária das mensagens dos grupos (Evolution) -> Supabase.
// Substitui o workflow n8n. Agendada via pg_cron (ver supabase/dump/migration-notes.md).
//
// Secrets necessárias (Edge Function → Settings → Secrets):
//   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, CRON_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente.
//
// Chamada: POST com header  x-cron-secret: <CRON_SECRET>  e ?lookbackHours=24
//   (use lookbackHours=0 no primeiro backfill p/ pegar todo o histórico).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractGroups, normalizeMessages, type MessageRow } from "./normalize.ts";

const SCHEMA = "clinic_control";
const PAGE_SIZE = 1000; // offset (msgs por grupo) no find-messages
const CONCURRENCY = 5; // grupos em paralelo

const EVO_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const EVO_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function evoHeaders(json = false): HeadersInit {
  const h: Record<string, string> = { apikey: EVO_KEY };
  if (json) h["content-type"] = "application/json";
  return h;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
    return Response.json({ ok: false, error: "Evolution env ausente" }, { status: 500 });
  }

  const lookbackHours = Number(new URL(req.url).searchParams.get("lookbackHours") ?? "24");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) grupos
  const gRes = await fetch(
    `${EVO_URL}/group/fetchAllGroups/${EVO_INSTANCE}?getParticipants=false`,
    { headers: evoHeaders() },
  );
  const groups = extractGroups(await gRes.json(), EVO_INSTANCE);

  // auto-descobre grupos (não sobrescreve clinic_id: não está no payload)
  if (groups.length) {
    await supabase
      .from("whatsapp_groups")
      .upsert(groups, { onConflict: "group_jid", ignoreDuplicates: false });
  }

  // 2) mensagens por grupo (concorrência limitada)
  const allRows: MessageRow[] = [];
  let fetchErrors = 0;
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    const batch = groups.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (g) => {
        try {
          const r = await fetch(`${EVO_URL}/chat/findMessages/${EVO_INSTANCE}`, {
            method: "POST",
            headers: evoHeaders(true),
            body: JSON.stringify({
              where: { key: { remoteJid: g.group_jid } },
              page: 1,
              offset: PAGE_SIZE,
            }),
          });
          return normalizeMessages(await r.json(), EVO_INSTANCE, lookbackHours);
        } catch (_e) {
          fetchErrors++;
          return [] as MessageRow[];
        }
      }),
    );
    for (const rows of results) allRows.push(...rows);
  }

  // 3) grava mensagens (idempotente por group_jid+message_id)
  let inserted = 0;
  let insertErrors = 0;
  for (let i = 0; i < allRows.length; i += 500) {
    const chunk = allRows.slice(i, i + 500);
    const { error } = await supabase
      .from("whatsapp_group_messages")
      .upsert(chunk, { onConflict: "group_jid,message_id", ignoreDuplicates: true });
    if (error) insertErrors++;
    else inserted += chunk.length;
  }

  return Response.json({
    ok: true,
    lookbackHours,
    groups: groups.length,
    messages_seen: allRows.length,
    inserted,
    fetchErrors,
    insertErrors,
  });
});
