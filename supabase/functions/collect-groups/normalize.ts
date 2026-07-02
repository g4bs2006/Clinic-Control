// Lógica pura de extração/normalização dos dados da Evolution.
// Sem globals de Deno/Node → testável no vitest e reutilizada pela Edge Function.

export interface GroupRow {
  group_jid: string;
  name: string | null;
  instance: string;
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
