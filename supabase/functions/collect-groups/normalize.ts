// Lógica pura de extração/normalização dos dados da Evolution.
// Sem globals de Deno/Node → testável no vitest e reutilizada pela Edge Function.

export interface GroupRow {
  group_jid: string;
  name: string | null;
  instance: string;
}

/** GroupRow + o estado de sincronização que dirige o rodízio da coleta. */
export interface GroupSyncState extends GroupRow {
  clinic_id: string | null;
  /** Última página varrida com sucesso (cursor de paginação, migration 0075). */
  last_synced_page: number;
  /** Quando o grupo foi coletado pela última vez (cursor do rodízio, 0076). */
  last_collected_at: string | null;
}

export interface MessageRow {
  clinic_id: null;
  instance: string;
  group_jid: string;
  message_id: string;
  from_me: boolean;
  participant: string | null;
  push_name: string | null;
  message_type: string | null;
  text: string | null;
  event_ts: string;
}

const MAX_TEXT_LEN = 4000;

// Texto da mensagem: conversa simples, texto estendido (reply/link) ou legenda
// de mídia. Mídia sem legenda (áudio, figurinha…) fica null.
export function extractText(message: unknown): string | null {
  const m = (message ?? {}) as Record<string, any>;
  const raw =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) : t;
}

// Nº de páginas do findMessages ({messages:{pages}}, com ou sem envelope data).
// A ordenação dos records NÃO é cronológica confiável → é preciso varrer todas
// as páginas mesmo na coleta diária (o filtro de lookback descarta as antigas).
export function extractPagesCount(payload: unknown): number {
  const j = (payload ?? {}) as Record<string, any>;
  const d = (j.data ?? j) as Record<string, any>;
  const p = d?.messages?.pages;
  return typeof p === "number" && Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

// Intervalo de páginas a buscar nesta execução (a partir da página 2 — a 1
// já foi lida antes, pra descobrir `totalPages`). Início: do zero (checkpoint
// ausente) ou do checkpoint salvo com overlap (a última página pode ter
// ganhado registros novos entre uma execução e outra). Fim: LIMITADO a
// `maxPagesPerRun` páginas além do início, mesmo que o total real seja muito
// maior — um checkpoint desatualizado (ex.: grupo que cresceu além do teto
// antigo enquanto a busca ficava truncada) não pode virar uma varredura sem
// teto numa única chamada; o catch-up acontece gradualmente, run após run,
// até o checkpoint alcançar `totalPages`.
export function pageRangeToFetch(
  totalPages: number,
  checkpoint: number,
  maxPagesPerRun: number,
  overlapPages: number,
): { start: number; end: number } {
  const start = checkpoint <= 0 ? 2 : Math.max(2, checkpoint - overlapPages + 1);
  return { start, end: Math.min(totalPages, start + maxPagesPerRun - 1) };
}

// Ordem em que os grupos são varridos numa execução. Uma coleta completa não
// cabe no limite de execução da Edge Function (81 grupos × ~3,4s de Evolution
// ≈ 275s, contra 200s), então cada run processa o que couber no deadline e as
// seguintes continuam daqui — este é o rodízio que garante que ninguém fique
// pra trás: grupos mapeados a clínica primeiro (são os que alimentam resumo e
// tarefas), e dentro disso os menos recentemente coletados (nunca coletado
// vem antes de todos).
export function orderGroupsForRun<
  T extends { clinic_id?: string | null; last_collected_at?: string | null },
>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const mapped = (a.clinic_id ? 0 : 1) - (b.clinic_id ? 0 : 1);
    if (mapped !== 0) return mapped;
    const at = a.last_collected_at ? Date.parse(a.last_collected_at) : 0;
    const bt = b.last_collected_at ? Date.parse(b.last_collected_at) : 0;
    return at - bt;
  });
}

// A Evolution devolve { success, data: [ ...grupos... ] } no fetchAllGroups.
export function extractGroups(payload: unknown, instance: string): GroupRow[] {
  const j = (payload ?? {}) as Record<string, any>;
  const groups: any[] =
    (Array.isArray(j) && j) ||
    (Array.isArray(j.data) && j.data) ||
    (Array.isArray(j.groups) && j.groups) ||
    (j.data && Array.isArray(j.data.groups) && j.data.groups) ||
    [];

  const out: GroupRow[] = [];
  for (const g of groups) {
    const jid = g?.id || g?.remoteJid || g?.jid;
    if (!jid || !String(jid).endsWith("@g.us")) continue;
    out.push({
      group_jid: jid,
      name: g.subject || g.subjectOwner || g.name || null,
      instance,
    });
  }
  return out;
}

// findMessages devolve { success, data: { messages: { records: [...] } } }.
// Nestes grupos NÃO vem key.participant; o remetente está no pushName (id @lid).
// lookbackHours = 0 → sem filtro (backfill). now injetável p/ testes.
export function normalizeMessages(
  payload: unknown,
  instance: string,
  lookbackHours = 0,
  now = Date.now(),
): MessageRow[] {
  const j = (payload ?? {}) as Record<string, any>;
  const d = (j.data ?? j) as Record<string, any>;
  const records: any[] =
    (d && d.messages && Array.isArray(d.messages.records) && d.messages.records) ||
    (d && Array.isArray(d.messages) && d.messages) ||
    (Array.isArray(d) && d) ||
    (Array.isArray(j) && j) ||
    [];

  const cutoffMs = lookbackHours > 0 ? now - lookbackHours * 3600 * 1000 : 0;
  const out: MessageRow[] = [];

  for (const r of records) {
    const key = r?.key || {};
    if (!key.id) continue;

    const groupJid: string = key.remoteJid || "";
    if (!groupJid.endsWith("@g.us")) continue; // só grupos

    const ts = r.messageTimestamp ?? null;
    const tsMs =
      typeof ts === "number"
        ? ts < 1e12
          ? ts * 1000
          : ts
        : ts
          ? new Date(ts).getTime()
          : now;
    if (tsMs < cutoffMs) continue;

    const sender =
      (key.participant && String(key.participant).split("@")[0]) || r.pushName || null;

    out.push({
      clinic_id: null,
      instance,
      group_jid: groupJid,
      message_id: key.id,
      from_me: key.fromMe === true,
      participant: sender,
      push_name: r.pushName || null,
      message_type: r.messageType || null,
      text: extractText(r.message),
      event_ts: new Date(tsMs).toISOString(),
    });
  }
  return out;
}
