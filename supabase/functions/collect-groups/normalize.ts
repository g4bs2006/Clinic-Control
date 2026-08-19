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

// A Evolution não garante a forma do payload, então toda navegação aqui é
// defensiva. Estes dois helpers existem pra fazer isso sem `any`: `asObj`
// devolve um saco de `unknown` (acesso livre a chaves, mas cada valor precisa
// ser estreitado antes de virar dado nosso) e `asStr` é o estreitamento —
// devolve null tanto para tipo errado quanto para string vazia, que é o mesmo
// comportamento do `||` que estava aqui antes.
function asObj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

// Texto da mensagem: conversa simples, texto estendido (reply/link) ou legenda
// de mídia. Mídia sem legenda (áudio, figurinha…) fica null.
export function extractText(message: unknown): string | null {
  const m = asObj(message);
  const raw =
    asStr(m.conversation) ??
    asStr(asObj(m.extendedTextMessage).text) ??
    asStr(asObj(m.imageMessage).caption) ??
    asStr(asObj(m.videoMessage).caption) ??
    asStr(asObj(m.documentMessage).caption);
  if (raw === null) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) : t;
}

// Nº de páginas do findMessages ({messages:{pages}}, com ou sem envelope data).
// A ordenação dos records NÃO é cronológica confiável → é preciso varrer todas
// as páginas mesmo na coleta diária (o filtro de lookback descarta as antigas).
export function extractPagesCount(payload: unknown): number {
  const j = asObj(payload);
  const d = asObj(j.data ?? j);
  const p = asObj(d.messages).pages;
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

/** Resultado da varredura de um grupo, do ponto de vista do cursor. */
export interface GroupRunResult {
  groupJid: string;
  /** Última página varrida, ou null se a busca na Evolution falhou. */
  newCheckpoint: number | null;
}

// Quais cursores gravar depois de um lote. Um grupo só avança se as mensagens
// dele foram REALMENTE gravadas: avançar o cursor em cima de uma gravação que
// falhou é perda permanente, porque a coleta seguinte parte de `now - lookback`
// e ninguém nunca repede a janela perdida. Grupo com falha de escrita (ou de
// busca, `newCheckpoint: null`) fica sem cursor novo e volta ao topo do rodízio.
export function cursorUpdatesFor(
  results: GroupRunResult[],
  failedGroups: ReadonlySet<string>,
  collectedAt: string,
): { group_jid: string; last_synced_page: number; last_collected_at: string }[] {
  return results
    .filter((r) => r.newCheckpoint !== null && !failedGroups.has(r.groupJid))
    .map((r) => ({
      group_jid: r.groupJid,
      last_synced_page: r.newCheckpoint as number,
      last_collected_at: collectedAt,
    }));
}

// A Evolution devolve { success, data: [ ...grupos... ] } no fetchAllGroups.
export function extractGroups(payload: unknown, instance: string): GroupRow[] {
  const j = asObj(payload);
  const jData = asObj(j.data);
  const groups: unknown[] =
    (Array.isArray(j) && j) ||
    (Array.isArray(j.data) && j.data) ||
    (Array.isArray(j.groups) && j.groups) ||
    (Array.isArray(jData.groups) && jData.groups) ||
    [];

  const out: GroupRow[] = [];
  for (const raw of groups) {
    const g = asObj(raw);
    const jid = asStr(g.id) ?? asStr(g.remoteJid) ?? asStr(g.jid);
    if (!jid || !jid.endsWith("@g.us")) continue;
    out.push({
      group_jid: jid,
      name: asStr(g.subject) ?? asStr(g.subjectOwner) ?? asStr(g.name),
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
  const j = asObj(payload);
  const d = asObj(j.data ?? j);
  const dMessages = asObj(d.messages);
  const records: unknown[] =
    (Array.isArray(dMessages.records) && dMessages.records) ||
    (d && Array.isArray(d.messages) && d.messages) ||
    (Array.isArray(d) && d) ||
    (Array.isArray(j) && j) ||
    [];

  const cutoffMs = lookbackHours > 0 ? now - lookbackHours * 3600 * 1000 : 0;
  const out: MessageRow[] = [];

  for (const rec of records) {
    const r = asObj(rec);
    const key = asObj(r.key);
    const messageId = asStr(key.id);
    if (!messageId) continue;

    const groupJid = asStr(key.remoteJid) ?? "";
    if (!groupJid.endsWith("@g.us")) continue; // só grupos

    const ts = r.messageTimestamp ?? null;
    const tsMs =
      typeof ts === "number"
        ? ts < 1e12
          ? ts * 1000
          : ts
        : ts
          ? new Date(String(ts)).getTime()
          : now;
    if (tsMs < cutoffMs) continue;

    const participant = asStr(key.participant);
    const sender = (participant && participant.split("@")[0]) || asStr(r.pushName);

    out.push({
      clinic_id: null,
      instance,
      group_jid: groupJid,
      message_id: messageId,
      from_me: key.fromMe === true,
      participant: sender,
      push_name: asStr(r.pushName),
      message_type: asStr(r.messageType),
      text: extractText(r.message),
      event_ts: new Date(tsMs).toISOString(),
    });
  }
  return out;
}
