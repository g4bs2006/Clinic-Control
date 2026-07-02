import type {
  HelenaPanel,
  HelenaStep,
  HelenaCard,
  HelenaCompany,
  HelenaDepartment,
  HelenaAgent,
  HelenaChannel,
} from "./types";

const DEFAULT_BASE = "https://api.wts.chat";
const MAX_PAGES = 500;

type Opts = { fetchImpl?: typeof fetch; baseUrl?: string };

async function get(token: string, path: string, query: Record<string, string>, opts?: Opts) {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const base = opts?.baseUrl ?? DEFAULT_BASE;
  const qs = new URLSearchParams(query).toString();
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
    throw new Error(`Helena API ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return res.json().catch(() => ({}));
}

export async function listPanels(token: string, opts?: Opts): Promise<HelenaPanel[]> {
  const data = await get(token, "/crm/v1/panel", { PageSize: "100" }, opts);
  return (data.items ?? []).map((p: HelenaPanel) => ({ id: p.id, title: p.title, key: p.key, companyId: p.companyId }));
}

export async function getPanelWithSteps(token: string, panelId: string, opts?: Opts) {
  const data = await get(token, `/crm/v1/panel/${panelId}`, { IncludeDetails: "Steps" }, opts);
  const steps: HelenaStep[] = (data.steps ?? [])
    .map((s: HelenaStep) => ({ id: s.id, title: s.title, position: s.position, cardCount: s.cardCount, monetaryAmount: s.monetaryAmount ?? 0 }))
    .sort((a: HelenaStep, b: HelenaStep) => a.position - b.position);
  return { panel: { id: data.id, title: data.title, key: data.key, companyId: data.companyId } as HelenaPanel, steps };
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
        customFields: c.customFields ?? undefined,
      });
    }
    if (!data.hasMorePages) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error("Helena API: paginação excedeu o limite de páginas");
  }
  return out;
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
  const items = Array.isArray(data) ? data : (data.items ?? []);
  return items.map((d: any) => ({
    id: d.id,
    name: d.name,
  }));
}

export async function listUsers(token: string, opts?: Opts): Promise<HelenaAgent[]> {
  const data = await get(token, "/core/v1/agent", {}, opts);
  const items = Array.isArray(data) ? data : (data.items ?? []);
  return items.map((a: any) => ({
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

export async function listChannels(token: string, opts?: Opts): Promise<HelenaChannel[]> {
  const data = await get(token, "/chat/v1/channel", {}, opts);
  const items = Array.isArray(data) ? data : (data.items ?? []);
  return items.map((c: any) => ({
    id: c.id,
    name: c.identity?.displayName || c.numberFormatted || c.number || c.type,
    type: c.type,
    status: c.active ? "active" : "inactive",
  }));
}
