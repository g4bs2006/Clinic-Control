// Edge Function: coleta das mensagens dos grupos (Evolution) -> Supabase.
// Substitui o workflow n8n. Agendada via pg_cron (4x/dia).
//
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, CRON_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente.
//
// Chamada: POST com header x-cron-secret: <CRON_SECRET> e ?lookbackHours=24
//   (use lookbackHours=0 no backfill manual — ignora o checkpoint de página).
//   ?probe=1 → diagnóstico da Evolution, não coleta (ver bloco abaixo).
//
// ── Por que esta função trabalha em fatias ──────────────────────────────────
// Medição do ?probe=1 contra a Evolution de produção (2026-08-17):
//   fetchAllGroups ~12s · findMessages ~3,4s POR GRUPO (custo fixo de query:
//   88KB levou 6,1s e 621KB levou 4,5s) · 8 grupos sequencial 27,2s vs 20,4s
//   em paralelo → a Evolution SERIALIZA, concorrência quase não ajuda.
// Logo 81 grupos × 3,4s ≈ 275s + 12s ≈ 287s, contra ~200s de limite de
// execução da Edge Function. Uma coleta completa NÃO CABE em uma execução.
// Antes a função só gravava no fim, então ser morta aos 200s zerava tudo — a
// coleta passou 7 dias (11→17/08) sem inserir uma linha, o que por tabela
// parou os resumos diários e a geração de tarefas por IA.
// Agora: grava por lote, para sozinha no deadline e varre em round-robin
// (last_collected_at), de modo que as 4 execuções diárias cobrem todos os
// grupos e nenhum trabalho é perdido.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cursorUpdatesFor,
  extractGroups,
  extractPagesCount,
  normalizeMessages,
  orderGroupsForRun,
  pageRangeToFetch,
  type GroupSyncState,
  type MessageRow,
} from "./normalize.ts";

const SCHEMA = "clinic_control";
const PAGE_SIZE = 1000;
// Teto de páginas por grupo por execução. A maioria dos grupos tem 1 página,
// mas há exceções grandes (ex.: "Importante - CONTACT IA", 36.783 mensagens /
// 37 páginas) — sem teto, um único grupo desses consome a execução inteira.
const MAX_PAGES_PER_RUN = 40;
const OVERLAP_PAGES = 2;
const CONCURRENCY = 5;
// Abaixo do limite real (~200s) com folga para o último lote gravar e a
// resposta voltar. Preferimos devolver 200 com partial:true a ser mortos.
const RUN_DEADLINE_MS = 120_000;

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
  const startedAt = Date.now();
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
    return Response.json({ ok: false, error: "Evolution env ausente" }, { status: 500 });
  }

  const url = new URL(req.url);
  const lookbackHours = Number(url.searchParams.get("lookbackHours") ?? "24");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── ?probe=1 — diagnóstico, não coleta ─────────────────────────────────────
  // Mede o custo REAL da Evolution (latência, bytes, totalPages, e se ela
  // paraleliza) numa amostra pequena. É o que transformou "a coleta está
  // lenta" em números — sem isso, mexer nos tetos é chute. Responde em ~30s.
  if (url.searchParams.get("probe") === "1") {
    const sampleSize = Number(url.searchParams.get("samples") ?? "3");
    const t0 = Date.now();
    const gr = await fetch(`${EVO_URL}/group/fetchAllGroups/${INST}?getParticipants=false`, {
      headers: evoHeaders(),
    });
    const gText = await gr.text();
    const fetchAllGroupsMs = Date.now() - t0;

    const { data: sample } = await supabase
      .from("whatsapp_groups")
      .select("group_jid, name, last_synced_page")
      .limit(sampleSize);

    const samples = [];
    for (const g of sample ?? []) {
      const t1 = Date.now();
      const r = await fetch(`${EVO_URL}/chat/findMessages/${INST}`, {
        method: "POST",
        headers: evoHeaders(true),
        body: JSON.stringify({
          where: { key: { remoteJid: g.group_jid } },
          page: 1,
          offset: PAGE_SIZE,
        }),
      });
      const text = await r.text();
      const ms = Date.now() - t1;
      let totalPages = -1;
      let records = -1;
      let totalMsgs = -1;
      try {
        const j = JSON.parse(text);
        const d = (j?.data ?? j) as Record<string, unknown>;
        const msgs = (d?.messages ?? {}) as Record<string, unknown>;
        totalPages = extractPagesCount(j);
        records = Array.isArray(msgs.records) ? msgs.records.length : -1;
        totalMsgs = typeof msgs.total === "number" ? msgs.total : -1;
      } catch { /* payload não-JSON: os -1 acima já sinalizam */ }
      samples.push({
        group: g.name ?? g.group_jid,
        status: r.status,
        ms,
        kb: Math.round(text.length / 1024),
        totalPages,
        records,
        totalMsgs,
        checkpoint: g.last_synced_page,
      });
    }

    // Os mesmos grupos, agora em PARALELO: paralelo << sequencial significa
    // que a Evolution paraleliza (subir CONCURRENCY ajudaria); ≈ igual
    // significa que ela serializa, e só reduzir escopo/tempo resolve.
    const tPar = Date.now();
    await Promise.all(
      (sample ?? []).map((g) =>
        fetch(`${EVO_URL}/chat/findMessages/${INST}`, {
          method: "POST",
          headers: evoHeaders(true),
          body: JSON.stringify({
            where: { key: { remoteJid: g.group_jid } },
            page: 1,
            offset: PAGE_SIZE,
          }),
        }).then((r) => r.text()).catch(() => ""),
      ),
    );
    const parallelMs = Date.now() - tPar;

    return Response.json({
      ok: true,
      probe: true,
      pageSize: PAGE_SIZE,
      fetchAllGroups: { status: gr.status, ms: fetchAllGroupsMs, kb: Math.round(gText.length / 1024) },
      samples,
      concurrency: { sequentialMs: samples.reduce((a, s) => a + s.ms, 0), parallelMs, n: samples.length },
    });
  }

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

  // ?discoverOnly=1 — só descobre grupos novos, não coleta mensagens. É o que
  // o botão "Buscar grupos novos" da tela de configuração realmente precisa:
  // descoberta custa ~12s (só o fetchAllGroups acima), enquanto a coleta
  // completa leva ~120s e estouraria o tempo da server action. A coleta de
  // mensagens continua a cargo do cron.
  if (url.searchParams.get("discoverOnly") === "1") {
    return Response.json({
      ok: true,
      discoverOnly: true,
      elapsedMs: Date.now() - startedAt,
      groupsFetched: fetched.length,
      fetchAllGroupsStatus: gStatus,
    });
  }

  // união (fetched + conhecidos no banco) para não depender do fetchAllGroups
  const { data: known } = await supabase
    .from("whatsapp_groups")
    .select("group_jid, name, clinic_id, last_synced_page, last_collected_at");
  const stateByJid = new Map<string, GroupSyncState>();
  for (const k of known ?? []) {
    stateByJid.set(k.group_jid as string, {
      group_jid: k.group_jid as string,
      name: (k.name as string | null) ?? null,
      instance: EVO_INSTANCE,
      clinic_id: (k.clinic_id as string | null) ?? null,
      last_synced_page: (k.last_synced_page as number | null) ?? 0,
      last_collected_at: (k.last_collected_at as string | null) ?? null,
    });
  }
  // Grupo recém-descoberto entra sem cursor — o rodízio o trata como "nunca
  // coletado", então ele é atendido logo na próxima execução.
  for (const g of fetched) {
    const prev = stateByJid.get(g.group_jid);
    stateByJid.set(g.group_jid, {
      group_jid: g.group_jid,
      instance: EVO_INSTANCE,
      name: g.name ?? prev?.name ?? null,
      clinic_id: prev?.clinic_id ?? null,
      last_synced_page: prev?.last_synced_page ?? 0,
      last_collected_at: prev?.last_collected_at ?? null,
    });
  }
  const groups = orderGroupsForRun([...stateByJid.values()]);

  // 2) mensagens por grupo. A ordenação do findMessages não é cronológica
  // confiável, então cada grupo é varrido a partir do checkpoint de página
  // salvo (ver pageRangeToFetch) em vez de só pedir a última página.
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

  // Grava um lote já normalizado. Chamado a CADA lote, nunca só no fim: a
  // função pode ser interrompida antes de terminar todos os grupos, e gravar
  // no fim significava perder 100% do trabalho — a causa da coleta ter ficado
  // 7 dias sem inserir nada.
  // Devolve também quais grupos tiveram lote com erro: quem não gravou não pode
  // ganhar cursor novo (ver cursorUpdatesFor).
  async function persist(
    rows: MessageRow[],
  ): Promise<{ inserted: number; errors: number; failedGroups: Set<string> }> {
    // dedup: a Evolution repete records; ON CONFLICT DO UPDATE não aceita a
    // mesma linha duas vezes no mesmo comando. Em duplicata, fica a com texto.
    const byKey = new Map<string, MessageRow>();
    for (const r of rows) {
      const k = `${r.group_jid}|${r.message_id}`;
      const prev = byKey.get(k);
      if (!prev || (!prev.text && r.text)) byKey.set(k, r);
    }
    const unique = [...byKey.values()];
    let inserted = 0;
    let errors = 0;
    const failedGroups = new Set<string>();
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      // merge (não ignore): re-runs atualizam linhas antigas — ex.: preencher text
      const { error } = await supabase
        .from("whatsapp_group_messages")
        .upsert(chunk, { onConflict: "group_jid,message_id", ignoreDuplicates: false });
      if (error) {
        errors++;
        // O lote é por tamanho, não por grupo: qualquer grupo com linha no lote
        // perdido é suspeito e não avança o cursor.
        for (const r of chunk) failedGroups.add(r.group_jid);
      } else inserted += chunk.length;
    }
    return { inserted, errors, failedGroups };
  }

  let messagesSeen = 0;
  let inserted = 0;
  let insertErrors = 0;
  let cursorErrors = 0;
  let fetchErrors = 0;
  let pagesFetched = 0;
  let groupsProcessed = 0;
  let partial = false;

  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    // Para de abrir lote novo perto do deadline e devolve 200 com partial:true
    // em vez de ser morta no meio de uma gravação. O que já foi coletado está
    // gravado, e o rodízio faz a próxima execução seguir de onde esta parou.
    if (Date.now() - startedAt > RUN_DEADLINE_MS) {
      partial = true;
      break;
    }

    const batch = groups.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (g) => {
        try {
          const first = await fetchPage(g.group_jid, 1);
          const rows = normalizeMessages(first, EVO_INSTANCE, lookbackHours);
          const totalPages = extractPagesCount(first);
          pagesFetched++;
          // lookbackHours=0 é o backfill manual documentado no README ("pega
          // TODO o histórico") — ignora o checkpoint e varre do zero.
          const checkpoint = lookbackHours > 0 ? g.last_synced_page ?? 0 : 0;
          const { start, end } = pageRangeToFetch(totalPages, checkpoint, MAX_PAGES_PER_RUN, OVERLAP_PAGES);
          for (let p = start; p <= end; p++) {
            rows.push(...normalizeMessages(await fetchPage(g.group_jid, p), EVO_INSTANCE, lookbackHours));
            pagesFetched++;
          }
          // Nunca além de `end`: se MAX_PAGES_PER_RUN truncou a varredura,
          // marcar o checkpoint em `totalPages` faria a próxima execução pular
          // pra sempre as páginas que ficaram de fora.
          return { groupJid: g.group_jid, rows, newCheckpoint: end };
        } catch {
          fetchErrors++;
          // Sem cursor: o grupo não conta como coletado e volta ao topo do
          // rodízio na próxima execução, em vez de ficar um dia sem coleta.
          return { groupJid: g.group_jid, rows: [] as MessageRow[], newCheckpoint: null };
        }
      }),
    );

    const batchRows = results.flatMap((r) => r.rows);
    messagesSeen += batchRows.length;
    const w = await persist(batchRows);
    inserted += w.inserted;
    insertErrors += w.errors;

    // Cursor do rodízio + checkpoint de página, só para quem coletou E gravou.
    const collectedAt = new Date().toISOString();
    const done = cursorUpdatesFor(results, w.failedGroups, collectedAt);
    if (done.length) {
      // Erro aqui também é silencioso e caro: sem cursor o grupo é recoletado
      // (custa tempo, não dados), mas precisa aparecer na resposta.
      const { error: cursorError } = await supabase
        .from("whatsapp_groups")
        .upsert(done, { onConflict: "group_jid", ignoreDuplicates: false });
      if (cursorError) cursorErrors++;
      else groupsProcessed += done.length;
    }
  }

  return Response.json({
    // Falha de ESCRITA não pode sair como sucesso: era isso que fazia o
    // `sync_warning` do gerador de tarefas (generate-runner.ts) nunca disparar,
    // e a coleta relatar "coletado" com o banco vazio. `fetchErrors` fica fora
    // de propósito — o grupo não avançou o cursor e sai na próxima execução,
    // então não houve perda; já `partial` é operação normal em fatias.
    ok: insertErrors === 0 && cursorErrors === 0,
    lookbackHours,
    partial, // true = deadline atingido; o resto sai na próxima execução
    elapsedMs: Date.now() - startedAt,
    groupsFetched: fetched.length,
    groupsKnown: groups.length,
    groupsProcessed,
    fetchAllGroupsStatus: gStatus,
    pagesFetched,
    messages_seen: messagesSeen,
    inserted,
    fetchErrors,
    insertErrors,
    cursorErrors,
    // generate-runner.ts lê `error` para montar o sync_warning que aparece na tela.
    error:
      insertErrors || cursorErrors
        ? `gravação falhou (${insertErrors} lote(s) de mensagem, ${cursorErrors} de cursor) — os grupos afetados serão recoletados`
        : undefined,
  });
});
