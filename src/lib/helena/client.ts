import type {
  HelenaPanel,
  HelenaStep,
  HelenaCard,
  HelenaCompany,
  HelenaDepartment,
  HelenaAgent,
  HelenaChannel,
  HelenaWebhookSubscription,
  HelenaTag,
} from "./types";

const DEFAULT_BASE = "https://api.wts.chat";
const MAX_PAGES = 500;

type Opts = { fetchImpl?: typeof fetch; baseUrl?: string };

async function get(
  token: string,
  path: string,
  query: Record<string, string | string[]>,
  opts?: Opts,
) {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const base = opts?.baseUrl ?? DEFAULT_BASE;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // IncludeDetails aceita múltiplos valores como o MESMO parâmetro repetido
    // (?IncludeDetails=Steps&IncludeDetails=Tags), não uma lista separada por vírgula.
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  const qs = params.toString();
  const res = await fetchImpl(`${base}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Helena API ${res.status}`);
  return res.json();
}

async function post(token: string, path: string, body: unknown, opts?: Opts) {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const base = opts?.baseUrl ?? DEFAULT_BASE;
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Helena API ${res.status}${text ? `: ${text.slice(0, 600)}` : ""}`);
  }
  return res.json().catch(() => ({}));
}

export async function listPanels(token: string, opts?: Opts): Promise<HelenaPanel[]> {
  const data = await get(token, "/crm/v1/panel", { PageSize: "100" }, opts);
  return (data.items ?? []).map((p: HelenaPanel) => ({ id: p.id, title: p.title, key: p.key, companyId: p.companyId }));
}

export async function getPanelWithSteps(token: string, panelId: string, opts?: Opts) {
  const data = await get(token, `/crm/v1/panel/${panelId}`, { IncludeDetails: ["Steps", "Tags"] }, opts);
  const steps: HelenaStep[] = (data.steps ?? [])
    .map((s: HelenaStep) => ({ id: s.id, title: s.title, position: s.position, cardCount: s.cardCount, monetaryAmount: s.monetaryAmount ?? 0 }))
    .sort((a: HelenaStep, b: HelenaStep) => a.position - b.position);
  // Etiquetas DO PAINEL (CRM/cards) — catálogo distinto do de contato
  // (GET /core/v1/tag). Só existe via IncludeDetails=Tags neste endpoint.
  const tags: HelenaTag[] = (data.tags ?? []).map((t: HelenaTag) => ({ id: t.id, name: t.name }));
  return { panel: { id: data.id, title: data.title, key: data.key, companyId: data.companyId } as HelenaPanel, steps, tags };
}

export async function listCards(
  token: string,
  panelId: string,
  range: { after?: string; before?: string },
  opts?: Opts,
): Promise<HelenaCard[]> {
  const out: HelenaCard[] = [];
  let page = 1;
  for (;;) {
    const query: Record<string, string> = { PanelId: panelId, PageSize: "100", PageNumber: String(page) };
    if (range.after) query["CreatedAt.After"] = range.after;
    if (range.before) query["CreatedAt.Before"] = range.before;
    const data = await get(token, "/crm/v1/panel/card", query, opts);
    for (const c of data.items ?? []) {
      out.push({
        id: c.id,
        stepId: c.stepId,
        title: c.title,
        monetaryAmount: c.monetaryAmount ?? null,
        createdAt: c.createdAt,
        tagIds: c.tagIds ?? [],
        customFields: c.customFields ?? undefined,
      });
    }
    if (!data.hasMorePages) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error("Helena API: paginação excedeu o limite de páginas");
  }
  return out;
}

/** Sessões cruas do período (payload completo — usado no relatório de conversas). */
export async function listSessionsRaw(
  token: string,
  range: { after: string; before: string },
  opts?: Opts,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let page = 1;
  for (;;) {
    const data = await get(
      token,
      "/chat/v2/session",
      {
        "CreatedAt.After": range.after,
        "CreatedAt.Before": range.before,
        OrderBy: "createdAt",
        OrderDirection: "ASCENDING",
        PageSize: "100",
        PageNumber: String(page),
      },
      opts,
    );
    const batch = data.items ?? [];
    out.push(...batch);
    if (!data.hasMorePages || batch.length === 0) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error("Helena API: paginação excedeu o limite de páginas");
  }
  return out;
}

/** Mensagens cruas de uma sessão, em ordem cronológica. */
export async function listSessionMessages(
  token: string,
  sessionId: string,
  opts?: Opts,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let page = 1;
  for (;;) {
    const data = await get(
      token,
      "/chat/v1/message",
      {
        SessionId: sessionId,
        OrderBy: "createdAt",
        OrderDirection: "ASCENDING",
        PageSize: "100",
        PageNumber: String(page),
      },
      opts,
    );
    const batch = data.items ?? [];
    out.push(...batch);
    if (!data.hasMorePages || batch.length === 0) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error("Helena API: paginação excedeu o limite de páginas");
  }
  return out;
}

/** Contato cru por id (nome/telefone/tags) — null se não encontrado. */
export async function getContactRaw(
  token: string,
  contactId: string,
  opts?: Opts,
): Promise<Record<string, unknown> | null> {
  try {
    return await get(token, `/core/v1/contact/${contactId}`, {}, opts);
  } catch {
    return null;
  }
}

export async function getContactCount(token: string, opts?: Opts): Promise<number> {
  const data = await get(token, "/core/v1/contact", { PageSize: "1" }, opts);
  return data.totalItems ?? 0;
}

export async function getChatCounts(
  token: string,
  range: { after?: string; before?: string },
  opts?: Opts,
): Promise<{ open: number; closed: number }> {
  const query: Record<string, string> = { PageSize: "1" };
  if (range.after) query["CreatedAt.After"] = range.after;
  if (range.before) query["CreatedAt.Before"] = range.before;

  const totalData = await get(token, "/chat/v2/session", query, opts);
  const total = totalData.totalItems ?? 0;

  const closedData = await get(token, "/chat/v2/session", { ...query, Status: "COMPLETED" }, opts);
  const closed = closedData.totalItems ?? 0;

  return { open: Math.max(0, total - closed), closed };
}

export type TakeoverStats = {
  total: number;        // conversas individuais criadas no período
  humanAssumed: number; // com atendente humano designado (userId preenchido)
  botOnly: number;      // só o bot atuou (botId sem userId)
  untouched: number;    // sem bot nem humano designado
};

/**
 * Conta quantas conversas do período foram assumidas por humano.
 * Sinal: `session.userId` preenchido = um usuário (atendente) assumiu a conversa;
 * `botId` sem userId = a IA conduziu sozinha (validado na conta real em 2026-07-03).
 */
export async function getSessionTakeoverStats(
  token: string,
  range: { after?: string; before?: string },
  opts?: Opts,
): Promise<TakeoverStats> {
  const stats: TakeoverStats = { total: 0, humanAssumed: 0, botOnly: 0, untouched: 0 };
  let page = 1;
  for (;;) {
    const query: Record<string, string> = {
      Type: "INDIVIDUAL",
      PageSize: "100",
      PageNumber: String(page),
    };
    if (range.after) query["CreatedAt.After"] = range.after;
    if (range.before) query["CreatedAt.Before"] = range.before;
    const data = await get(token, "/chat/v2/session", query, opts);
    for (const s of data.items ?? []) {
      stats.total += 1;
      if (s.userId) stats.humanAssumed += 1;
      else if (s.botId) stats.botOnly += 1;
      else stats.untouched += 1;
    }
    if (!data.hasMorePages) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error("Helena API: paginação excedeu o limite de páginas");
  }
  return stats;
}

export async function getCompanyInfo(
  token: string,
  companyId: string,
  opts?: Opts,
): Promise<HelenaCompany> {
  const data = await get(token, `/core/v1/company/${companyId}`, {}, { baseUrl: "https://api.helena.run", ...opts });
  return {
    id: data.id,
    name: data.name ?? null,
    legalName: data.legalName ?? null,
    status: data.status,
    setupStatus: data.setupStatus,
  };
}

export async function listDepartments(token: string, opts?: Opts): Promise<HelenaDepartment[]> {
  const data = await get(token, "/core/v2/department", {}, opts);
  const items: { id: string; name: string }[] = Array.isArray(data) ? data : (data.items ?? []);
  return items.map((d) => ({
    id: d.id,
    name: d.name,
  }));
}

export async function listUsers(token: string, opts?: Opts): Promise<HelenaAgent[]> {
  const data = await get(token, "/core/v1/agent", {}, opts);
  const items: { id: string; name: string; email?: string | null; active?: boolean }[] =
    Array.isArray(data) ? data : (data.items ?? []);
  return items.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email ?? null,
    active: a.active ?? true,
  }));
}

// ── Provisionamento (escrita com o token da própria clínica) ────────────────

/** Cria um usuário/agente na conta. profile: Admin | Agent | RestrictedAgent */
export async function createAgent(
  token: string,
  input: { name: string; email?: string | null; phoneNumber?: string | null; profile: "Admin" | "Agent" | "RestrictedAgent" },
  opts?: Opts,
) {
  return post(token, "/core/v1/agent", input, opts);
}

/** Cria uma equipe (department) na conta. */
export async function createDepartment(
  token: string,
  input: { name: string; isDefault?: boolean },
  opts?: Opts,
) {
  return post(token, "/core/v1/department", input, opts);
}

/** Cria um contato — usado como semente para materializar as tags padrão
 *  (a API não tem endpoint direto de criação de etiqueta; tagNames cria on-use). */
export async function createContact(
  token: string,
  input: { name: string; phoneNumber?: string | null; tagNames?: string[]; annotation?: string | null },
  opts?: Opts,
) {
  return post(token, "/core/v1/contact", input, opts);
}

/** Assinaturas de webhook da conta — requer token da própria conta com permissão
 *  (alguns tokens respondem 401 "Acesso negado"; trate no chamador). */
export async function listWebhookSubscriptions(
  token: string,
  opts?: Opts,
): Promise<HelenaWebhookSubscription[]> {
  type RawSubscription = {
    id: string;
    name?: string | null;
    url: string;
    enabled?: boolean;
    events?: (string | { event: string })[];
  };
  const data = await get(token, "/core/v1/webhook/subscription", {}, opts);
  const items: RawSubscription[] = Array.isArray(data) ? data : (data.items ?? []);
  return items.map((w) => ({
    id: w.id,
    name: w.name ?? null,
    url: w.url,
    enabled: w.enabled === true,
    events: (w.events ?? []).map((e) => (typeof e === "string" ? e : e.event)),
  }));
}

/** Catálogo de eventos de webhook assináveis (GET /core/v1/webhook/event). */
export async function listWebhookEvents(
  token: string,
  opts?: Opts,
): Promise<{ event: string; description: string | null }[]> {
  const data = await get(token, "/core/v1/webhook/event", {}, opts);
  const items: { event: string; description?: string | null }[] = Array.isArray(data)
    ? data
    : (data.items ?? []);
  return items.map((e) => ({ event: e.event, description: e.description ?? null }));
}

export async function listChannels(token: string, opts?: Opts): Promise<HelenaChannel[]> {
  type RawChannel = {
    id: string;
    type: string;
    active?: boolean;
    number?: string | null;
    numberFormatted?: string | null;
    identity?: { displayName?: string | null } | null;
  };
  const data = await get(token, "/chat/v1/channel", {}, opts);
  const items: RawChannel[] = Array.isArray(data) ? data : (data.items ?? []);
  return items.map((c) => ({
    id: c.id,
    name: c.identity?.displayName || c.numberFormatted || c.number || c.type,
    type: c.type,
    status: c.active ? "active" : "inactive",
  }));
}
