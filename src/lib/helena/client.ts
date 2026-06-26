import type { HelenaPanel, HelenaStep, HelenaCard } from "./types";

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
      out.push({ id: c.id, stepId: c.stepId, title: c.title, monetaryAmount: c.monetaryAmount ?? null, createdAt: c.createdAt });
    }
    if (!data.hasMorePages) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error("Helena API: paginação excedeu o limite de páginas");
  }
  return out;
}
