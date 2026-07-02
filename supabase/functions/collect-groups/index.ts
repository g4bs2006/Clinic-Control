// Edge Function: coleta diária das mensagens dos grupos (Evolution) -> Supabase.
// Substitui o workflow n8n. Agendada via pg_cron.
//
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, CRON_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente.
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET> e ?lookbackHours=24
//   (use lookbackHours=0 no primeiro backfill).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractGroups,
  extractPagesCount,
  normalizeMessages,
  type GroupRow,
  type MessageRow,
} from "./normalize.ts";

const SCHEMA = "clinic_control";
const PAGE_SIZE = 1000;
// Teto de segurança por grupo (40k msgs). A paginação é ASC (antigas primeiro):
// as mensagens NOVAS estão nas ÚLTIMAS páginas — um teto baixo corta o presente.
const MAX_PAGES = 40;
const CONCURRENCY = 5;

// .trim() defende contra espaços acidentais ao colar os secrets.
const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").trim().replace(/\/+$/, "");
const EVO_KEY = (Deno.env.get("EVOLUTION_API_KEY") ?? "").trim();
const EVO_INSTANCE = (Deno.env.get("EVOLUTION_INSTANCE") ?? "").trim();
const INST = encodeURIComponent(EVO_INSTANCE); // o nome pode ter espaços internos
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
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

  // 1) grupos: tenta a Evolution; se falhar, cai para os já descobertos no banco.
  const gRes = await fetch(
    `${EVO_URL}/group/fetchAllGroups/${INST}?getParticipants=false`,
    { headers: evoHeaders() },
  );
  const gStatus = gRes.status;
  const fetched = extractGroups(await gRes.json().catch(() => null), EVO_INSTANCE);

  if (fetched.length) {
    await supabase
      .from("whatsapp_groups")
      .upsert(fetched, { onConflict: "group_jid", ignoreDuplicates: false });
  }

  // união (fetched + conhecidos no banco) para não depender do fetchAllGroups
  const byJid = new Map<string, GroupRow>();
  const { data: known } = await supabase.from("whatsapp_groups").select("group_jid, name");
  for (const k of known ?? []) {
    byJid.set(k.group_jid, { group_jid: k.group_jid, name: k.name ?? null, instance: EVO_INSTANCE });
  }
  for (const g of fetched) byJid.set(g.group_jid, g);
  const groups = [...byJid.values()];

  // 2) mensagens por grupo (concorrência limitada), varrendo TODAS as páginas —
  // a ordenação do findMessages não é cronológica; sem varrer, msgs recentes
  // de grupos grandes ficam fora (bug corrigido em 2026-07-02).
  async function fetchPage(groupJid: string, page: number): Promise<unknown> {
    const r = await fetch(`${EVO_URL}/chat/findMessages/${INST}`, {
      method: "POST",
      headers: evoHeaders(true),
      body: JSON.stringify({
        where: { key: { remoteJid: groupJid } },
        page,
        offset: PAGE_SIZE,
      }),
    });
    return r.json();
  }

  const allRows: MessageRow[] = [];
  let fetchErrors = 0;
  let pagesFetched = 0;
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    const batch = groups.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (g) => {
        try {
          const first = await fetchPage(g.group_jid, 1);
          const rows = normalizeMessages(first, EVO_INSTANCE, lookbackHours);
          const pages = Math.min(extractPagesCount(first), MAX_PAGES);
          pagesFetched++;
          for (let p = 2; p <= pages; p++) {
            rows.push(...normalizeMessages(await fetchPage(g.group_jid, p), EVO_INSTANCE, lookbackHours));
            pagesFetched++;
          }
          return rows;
        } catch (_e) {
          fetchErrors++;
          return [] as MessageRow[];
        }
      }),
    );
    for (const rows of results) allRows.push(...rows);
  }

  // 3) grava mensagens (idempotente por group_jid+message_id)
  // dedup: a Evolution repete records; ON CONFLICT DO UPDATE não aceita a mesma
  // linha duas vezes no mesmo comando. Em duplicata, fica a versão com texto.
  const byKey = new Map<string, MessageRow>();
  for (const r of allRows) {
    const k = `${r.group_jid}|${r.message_id}`;
    const prev = byKey.get(k);
    if (!prev || (!prev.text && r.text)) byKey.set(k, r);
  }
  const rows = [...byKey.values()];

  let inserted = 0;
  let insertErrors = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    // merge (não ignore): re-runs atualizam linhas antigas — ex.: preencher text
    const { error } = await supabase
      .from("whatsapp_group_messages")
      .upsert(chunk, { onConflict: "group_jid,message_id", ignoreDuplicates: false });
    if (error) insertErrors++;
    else inserted += chunk.length;
  }

  return Response.json({
    ok: true,
    lookbackHours,
    groupsFetched: fetched.length,
    groupsUsed: groups.length,
    fetchAllGroupsStatus: gStatus,
    pagesFetched,
    messages_seen: allRows.length,
    messages_unique: rows.length,
    inserted,
    fetchErrors,
    insertErrors,
  });
});
