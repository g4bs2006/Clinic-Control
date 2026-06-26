# Fase 2 — Integração Helena + Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que clínicas em modo `auto` conectem-se ao CRM Helena: cadastrar o token (cifrado), selecionar o painel a partir de uma lista buscada na API, testar a conexão e ler o funil do mês corrente ao vivo.

**Architecture:** Camada isolada `lib/helena/` faz as chamadas HTTP à API Helena (sempre no servidor). Tokens são cifrados com AES-256-GCM (`lib/crypto/`) antes de ir para a tabela `clinic_integrations`. Server Actions orquestram onboarding (listar painéis → salvar → testar) e a leitura ao vivo do funil. Uma função pura mapeia as etapas/cards da Helena para o funil canônico de 9 etapas.

**Tech Stack:** Next.js (App Router) Server Actions, TypeScript, Supabase (Postgres), Node `crypto` (AES-256-GCM), Vitest.

## Global Constraints

- **Tema escuro prioritário; interface em pt-BR.**
- **Credenciais só no servidor.** Token Helena e a chave de cifragem NUNCA chegam ao browser nem a variáveis `NEXT_PUBLIC_`.
- Nova variável de ambiente **`HELENA_TOKEN_ENC_KEY`**: chave de 32 bytes em base64, usada para AES-256-GCM. Definir em `.env.local` e no Vercel. Adicionar a `.env.example` (vazia).
- Nova variável **`SUPABASE_SERVICE_ROLE_KEY`** (server-only, SEM `NEXT_PUBLIC_`): a tabela `clinic_integrations` guarda credenciais e é travada em service_role (RLS nega anon/authenticated, conforme `0003`). Todo acesso a ela acontece via um client service_role no servidor. Definir em `.env.local` e no Vercel; adicionar a `.env.example` (vazia). **Nunca** expor ao browser.
- **Base URL Helena:** `https://api.wts.chat`. Auth por header `Authorization: Bearer <token>`.
- Painel padrão "Controle de Leads" tem 9 etapas (Leads, Agendados, Não Agendados, Reagendados, Cancelados, Faltosos, Orçamento em Aberto, Compareceram e Não Fecharam, Compareceram e Fecharam). O mapeamento para o funil canônico é por **título** da etapa.
- Tabelas comuns recebem **RLS** (authenticated full access, anon revogado), seguindo o padrão da Fase 1 (`0002_rls.sql`). **Exceção:** `clinic_integrations` (credenciais) é travada em service_role — RLS nega anon E authenticated; acesso só no servidor via service client.
- TDD para lógica pura (client com fetch mockado, cifragem, mapeamento de funil). Commits frequentes.

## File Structure (Fase 2)

```
src/lib/
├── helena/
│   ├── types.ts            # tipos das respostas (Panel, Step, Card, paginação)
│   ├── client.ts           # listPanels / getPanelWithSteps / listCards (fetch injetável)
│   └── funnel.ts           # mapeia steps+cards -> contagem canônica de 9 etapas + taxa
├── crypto/
│   └── token.ts            # encryptToken / decryptToken (AES-256-GCM)
└── clinics/
    └── integration-actions.ts  # server actions: listPanelsForToken / saveIntegration / getIntegration / getLiveFunnel
supabase/migrations/
└── 0003_clinic_integrations.sql
src/components/clinics/
└── clinic-form.tsx         # (modificado) modo auto: token -> buscar painéis -> selecionar
```

---

### Task 1: Tipos e client da API Helena

**Files:**
- Create: `src/lib/helena/types.ts`, `src/lib/helena/client.ts`
- Test: `tests/helena-client.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Tipos: `HelenaPanel { id: string; title: string; key: string; companyId: string }`, `HelenaStep { id: string; title: string; position: number; cardCount: number; monetaryAmount: number }`, `HelenaCard { id: string; stepId: string; title: string; monetaryAmount: number | null; createdAt: string }`.
  - `listPanels(token: string, opts?: { fetchImpl?: typeof fetch; baseUrl?: string }): Promise<HelenaPanel[]>`
  - `getPanelWithSteps(token: string, panelId: string, opts?): Promise<{ panel: HelenaPanel; steps: HelenaStep[] }>`
  - `listCards(token: string, panelId: string, range: { after?: string; before?: string }, opts?): Promise<HelenaCard[]>` (segue paginação até `hasMorePages === false`).

- [ ] **Step 1: Escrever os testes falhando**

`tests/helena-client.test.ts` — usa `fetchImpl` mockado (sem rede). Casos:
```typescript
import { describe, it, expect, vi } from "vitest";
import { listPanels, getPanelWithSteps, listCards } from "@/lib/helena/client";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("listPanels", () => {
  it("mapeia items para HelenaPanel e envia Bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      items: [{ id: "p1", title: "Controle de Leads", key: "CDL", companyId: "c1" }],
      hasMorePages: false,
    })) as unknown as typeof fetch;
    const panels = await listPanels("tok", { fetchImpl });
    expect(panels).toEqual([{ id: "p1", title: "Controle de Leads", key: "CDL", companyId: "c1" }]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/crm/v1/panel");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });
});

describe("getPanelWithSteps", () => {
  it("retorna painel e etapas ordenadas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      id: "p1", title: "Controle de Leads", key: "CDL", companyId: "c1",
      steps: [
        { id: "s2", title: "Agendados", position: 2, cardCount: 3, monetaryAmount: 0 },
        { id: "s1", title: "Leads", position: 1, cardCount: 10, monetaryAmount: 0 },
      ],
    })) as unknown as typeof fetch;
    const { panel, steps } = await getPanelWithSteps("tok", "p1", { fetchImpl });
    expect(panel.title).toBe("Controle de Leads");
    expect(steps.map((s) => s.position)).toEqual([1, 2]);
  });
});

describe("listCards", () => {
  it("segue a paginação até hasMorePages=false", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ items: [{ id: "c1", stepId: "s1", title: "x", monetaryAmount: null, createdAt: "2026-06-01T00:00:00Z" }], hasMorePages: true }))
      .mockResolvedValueOnce(ok({ items: [{ id: "c2", stepId: "s2", title: "y", monetaryAmount: 500, createdAt: "2026-06-02T00:00:00Z" }], hasMorePages: false })) as unknown as typeof fetch;
    const cards = await listCards("tok", "p1", {}, { fetchImpl });
    expect(cards.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("propaga erro HTTP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as unknown as Response) as unknown as typeof fetch;
    await expect(listPanels("tok", { fetchImpl })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- helena-client`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `types.ts` e `client.ts`**

`src/lib/helena/types.ts` — exporta as interfaces acima.

`src/lib/helena/client.ts`:
```typescript
import type { HelenaPanel, HelenaStep, HelenaCard } from "./types";

const DEFAULT_BASE = "https://api.wts.chat";

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
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- helena-client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/helena tests/helena-client.test.ts
git commit -m "feat: client da API Helena (painéis, etapas, cards)"
```

---

### Task 2: Cifragem de token (AES-256-GCM)

**Files:**
- Create: `src/lib/crypto/token.ts`
- Modify: `.env.example` (adicionar `HELENA_TOKEN_ENC_KEY=`)
- Test: `tests/token-crypto.test.ts`

**Interfaces:**
- Consumes: env `HELENA_TOKEN_ENC_KEY` (base64 de 32 bytes).
- Produces:
  - `encryptToken(plain: string, keyB64?: string): string` — retorna `iv:authTag:ciphertext` em base64.
  - `decryptToken(payload: string, keyB64?: string): string`.
  - `keyB64` opcional injetável para teste; default lê `process.env.HELENA_TOKEN_ENC_KEY`.

- [ ] **Step 1: Escrever os testes falhando**

`tests/token-crypto.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken } from "@/lib/crypto/token";

const key = randomBytes(32).toString("base64");

describe("token crypto", () => {
  it("faz round-trip (decrypt(encrypt(x)) === x)", () => {
    const plain = "pn_abc123TOKEN";
    const enc = encryptToken(plain, key);
    expect(enc).not.toContain(plain);
    expect(decryptToken(enc, key)).toBe(plain);
  });

  it("gera ciphertext diferente a cada chamada (IV aleatório)", () => {
    expect(encryptToken("x", key)).not.toBe(encryptToken("x", key));
  });

  it("falha ao decifrar com chave errada", () => {
    const enc = encryptToken("x", key);
    const other = randomBytes(32).toString("base64");
    expect(() => decryptToken(enc, other)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- token-crypto`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/crypto/token.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(keyB64?: string): Buffer {
  const b64 = keyB64 ?? process.env.HELENA_TOKEN_ENC_KEY;
  if (!b64) throw new Error("HELENA_TOKEN_ENC_KEY ausente");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("HELENA_TOKEN_ENC_KEY deve ter 32 bytes (base64)");
  return key;
}

export function encryptToken(plain: string, keyB64?: string): string {
  const key = getKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptToken(payload: string, keyB64?: string): string {
  const key = getKey(keyB64);
  const [ivB64, tagB64, ctB64] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
```

Adicionar a `.env.example`: `HELENA_TOKEN_ENC_KEY=`

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- token-crypto`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto tests/token-crypto.test.ts .env.example
git commit -m "feat: cifragem de token Helena (AES-256-GCM)"
```

---

### Task 3: Migração `clinic_integrations`

**Files:**
- Create: `supabase/migrations/0003_clinic_integrations.sql`

**Interfaces:**
- Consumes: tabela `clinics` (FK).
- Produces: tabela `clinic_integrations`.

- [ ] **Step 1: Escrever a migração**

`supabase/migrations/0003_clinic_integrations.sql`:
```sql
create table clinic_integrations (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  helena_token_encrypted text not null,   -- iv:tag:ciphertext (AES-256-GCM)
  panel_id uuid not null,
  company_id uuid,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinic_integrations_updated_at before update on clinic_integrations
  for each row execute function set_updated_at();

-- Tabela de CREDENCIAIS: travada em service_role. RLS ligado e SEM policy para
-- anon/authenticated => esses papéis são negados. O service_role ignora RLS e é
-- usado apenas no servidor (Server Actions).
alter table clinic_integrations enable row level security;
revoke all on clinic_integrations from anon;
revoke all on clinic_integrations from authenticated;
```

- [ ] **Step 2: Aplicar a migração**

Via Supabase MCP `apply_migration` (se conectado ao projeto) ou colando no SQL Editor do projeto. Note que o projeto de produção do usuário está em outra conta — neste caso, o SQL fica disponível para o usuário rodar.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_clinic_integrations.sql
git commit -m "feat: tabela clinic_integrations (token cifrado + painel)"
```

---

### Task 4: Mapeamento do funil ao vivo (lógica pura)

**Files:**
- Create: `src/lib/helena/funnel.ts`
- Test: `tests/helena-funnel.test.ts`

**Interfaces:**
- Consumes: `HelenaStep`, `HelenaCard` (Task 1); funil canônico de 9 etapas (mesmos títulos).
- Produces:
  - `CANONICAL_STEPS: string[]` (os 9 títulos, em ordem).
  - `buildLiveFunnel(steps: HelenaStep[], monthCards: HelenaCard[]): { steps: { title: string; count: number }[]; leads: number; scheduled: number; rate: number; revenue: number }`
  - Regras: conta `monthCards` por `stepId` (mapeando stepId→título via `steps`); ordena pelos 9 títulos canônicos; `leads` = contagem de "Leads", `scheduled` = "Agendados", `rate` = scheduled/leads (0 se leads=0); `revenue` = soma de `monetaryAmount` dos cards cujo step é "Compareceram e Fecharam".

- [ ] **Step 1: Escrever os testes falhando**

`tests/helena-funnel.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildLiveFunnel } from "@/lib/helena/funnel";

const steps = [
  { id: "s1", title: "Leads", position: 1, cardCount: 0, monetaryAmount: 0 },
  { id: "s2", title: "Agendados", position: 2, cardCount: 0, monetaryAmount: 0 },
  { id: "s9", title: "Compareceram e Fecharam", position: 9, cardCount: 0, monetaryAmount: 0 },
];
const card = (id: string, stepId: string, amount: number | null = null) =>
  ({ id, stepId, title: id, monetaryAmount: amount, createdAt: "2026-06-10T00:00:00Z" });

describe("buildLiveFunnel", () => {
  it("conta por etapa e calcula taxa", () => {
    const r = buildLiveFunnel(steps, [card("a", "s1"), card("b", "s1"), card("c", "s1"), card("d", "s1"), card("e", "s2")]);
    expect(r.leads).toBe(4); // 4 cards em Leads
    expect(r.scheduled).toBe(1);
    expect(r.rate).toBeCloseTo(0.2);
  });

  it("taxa 0 quando não há leads", () => {
    expect(buildLiveFunnel(steps, []).rate).toBe(0);
  });

  it("soma faturamento da etapa de fechamento", () => {
    const r = buildLiveFunnel(steps, [card("a", "s9", 1000), card("b", "s9", 500), card("c", "s2", 999)]);
    expect(r.revenue).toBe(1500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- helena-funnel`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/helena/funnel.ts`:
```typescript
import type { HelenaStep, HelenaCard } from "./types";

export const CANONICAL_STEPS = [
  "Leads", "Agendados", "Não Agendados", "Reagendados", "Cancelados",
  "Faltosos", "Orçamento em Aberto", "Compareceram e Não Fecharam", "Compareceram e Fecharam",
];

const CLOSING = "Compareceram e Fecharam";

export function buildLiveFunnel(steps: HelenaStep[], monthCards: HelenaCard[]) {
  const titleByStepId = new Map(steps.map((s) => [s.id, s.title]));
  const countByTitle = new Map<string, number>();
  let revenue = 0;
  for (const card of monthCards) {
    const title = titleByStepId.get(card.stepId);
    if (!title) continue;
    countByTitle.set(title, (countByTitle.get(title) ?? 0) + 1);
    if (title === CLOSING) revenue += card.monetaryAmount ?? 0;
  }
  const outSteps = CANONICAL_STEPS.map((title) => ({ title, count: countByTitle.get(title) ?? 0 }));
  const leads = countByTitle.get("Leads") ?? 0;
  const scheduled = countByTitle.get("Agendados") ?? 0;
  const rate = leads === 0 ? 0 : scheduled / leads;
  return { steps: outSteps, leads, scheduled, rate, revenue };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- helena-funnel`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/helena/funnel.ts tests/helena-funnel.test.ts
git commit -m "feat: mapeamento do funil ao vivo (Helena -> canônico)"
```

---

### Task 5: Server Actions de integração

**Files:**
- Create: `src/lib/supabase/service.ts` (client service_role, server-only)
- Create: `src/lib/clinics/integration-actions.ts`

**Interfaces:**
- Consumes: `listPanels`/`getPanelWithSteps`/`listCards` (Task 1), `encryptToken`/`decryptToken` (Task 2), `buildLiveFunnel` (Task 4), `createServiceClient` (Supabase service_role).
- A tabela `clinic_integrations` está travada em service_role (migração `0003`), então estas actions acessam-na via `createServiceClient()`, **nunca** pelo client autenticado. O service client usa `SUPABASE_SERVICE_ROLE_KEY` e só roda no servidor.
- Produces (Server Actions, `"use server"`):
  - `listPanelsForToken(token: string): Promise<{ ok: true; panels: { id: string; title: string; key: string; companyId: string }[] } | { ok: false; error: string }>` — chama a Helena e devolve os painéis para o dropdown.
  - `saveIntegration(clinicId: string, token: string, panelId: string): Promise<{ ok: true } | { ok: false; error: string }>` — busca o painel (para obter `companyId` + validar o token), cifra o token, faz upsert em `clinic_integrations`.
  - `getLiveFunnel(clinicId: string): Promise<{ ok: true; funnel: ReturnType<typeof buildLiveFunnel> } | { ok: false; error: string }>` — lê a integração, decifra o token, busca etapas + cards do mês corrente (UTC), aplica `buildLiveFunnel`.

- [ ] **Step 1: Criar o client service_role**

`src/lib/supabase/service.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

// Client de service_role — IGNORA RLS. Server-only. Usar apenas em Server Actions
// para acessar tabelas de credenciais (clinic_integrations). Nunca importar no client.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```
Adicionar `SUPABASE_SERVICE_ROLE_KEY=` ao `.env.example`.

- [ ] **Step 2: Implementar as actions**

`src/lib/clinics/integration-actions.ts`:
```typescript
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import { listPanels, getPanelWithSteps, listCards } from "@/lib/helena/client";
import { buildLiveFunnel } from "@/lib/helena/funnel";

export async function listPanelsForToken(token: string) {
  try {
    const panels = await listPanels(token);
    return { ok: true as const, panels };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar painéis" };
  }
}

export async function saveIntegration(clinicId: string, token: string, panelId: string) {
  try {
    const { panel } = await getPanelWithSteps(token, panelId); // valida token + obtém companyId
    const supabase = createServiceClient();
    const { error } = await supabase.from("clinic_integrations").upsert({
      clinic_id: clinicId,
      helena_token_encrypted: encryptToken(token),
      panel_id: panelId,
      company_id: panel.companyId,
      last_sync_at: new Date().toISOString(),
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao salvar integração" };
  }
}

function monthRangeUtc(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { after: start, before: end };
}

export async function getLiveFunnel(clinicId: string) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted, panel_id")
      .eq("clinic_id", clinicId)
      .single();
    if (error || !data) return { ok: false as const, error: "Integração não encontrada" };
    const token = decryptToken(data.helena_token_encrypted as string);
    const panelId = data.panel_id as string;
    const { steps } = await getPanelWithSteps(token, panelId);
    const range = monthRangeUtc();
    const cards = await listCards(token, panelId, range);
    return { ok: true as const, funnel: buildLiveFunnel(steps, cards) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler o funil" };
  }
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: type-check OK.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/service.ts src/lib/clinics/integration-actions.ts .env.example
git commit -m "feat: server actions de integração Helena (service_role, listar/salvar/funil)"
```

---

### Task 6: Onboarding no formulário (modo automático)

**Files:**
- Modify: `src/components/clinics/clinic-form.tsx`
- Create: `src/components/clinics/helena-integration-fields.tsx`

**Interfaces:**
- Consumes: `listPanelsForToken`, `saveIntegration`, `getLiveFunnel` (Task 5); estado de `mode` do formulário.
- Produces: no modo `auto`, substitui o aviso placeholder ("Fase 2") por um sub-componente que: (1) campo de token; (2) botão "Buscar painéis" → chama `listPanelsForToken` → popula um Select de painéis (título + key); (3) ao salvar a clínica, se modo=auto e painel selecionado, chama `saveIntegration(clinicId, token, panelId)`; (4) mostra resultado do teste de conexão ("✓ conectado" / erro via toast). Em modo edição, se já existe integração, oferece um botão "Testar / ver funil agora" que chama `getLiveFunnel` e exibe as contagens das 9 etapas.

- [ ] **Step 1: Criar o sub-componente `helena-integration-fields.tsx`**

`"use client"`. Props: `clinicId?: string`, `onPanelSelected: (token: string, panelId: string) => void`. Estado: `token`, `panels`, `selectedPanel`, `loading`, `funnelPreview`. Botão "Buscar painéis" chama `listPanelsForToken(token)`; em erro, toast. Select lista os painéis. Quando há `clinicId` (edição), botão "Ver funil agora" chama `getLiveFunnel(clinicId)` e renderiza a lista das 9 etapas com contagem + taxa.

- [ ] **Step 2: Integrar no `clinic-form.tsx`**

No `clinic-form.tsx`, quando `mode === "auto"`, renderizar `<HelenaIntegrationFields clinicId={defaultValues?.id} onPanelSelected={...} />` no lugar do Card placeholder. Guardar `token`/`panelId` selecionados em estado do form. Ajustar o fluxo de submit: após criar/atualizar a clínica com sucesso, se modo=auto e há token+panel, chamar `saveIntegration(clinicId, token, panelId)` (o `clinicId` vem do retorno de `createClinic` no caso de criação) e exibir o resultado. Em erro de integração, manter a clínica salva mas avisar via toast que a integração não foi concluída.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila; `/clinicas/nova` e `/clinicas/[id]/editar` continuam dinâmicas.

- [ ] **Step 4: Rodar a suíte**

Run: `npm test`
Expected: testes da Fase 1 + Fase 2 (helena-client, token-crypto, helena-funnel) passam.

- [ ] **Step 5: Commit**

```bash
git add src/components/clinics
git commit -m "feat: onboarding da integração Helena no formulário (modo auto)"
```

---

## Self-Review (cobertura — Fase 2)

- **Camada `lib/helena/`** (client + tipos + funil): Tasks 1, 4. ✅
- **Cifragem de token** (cifrado no banco, decisão do usuário): Task 2. ✅
- **Tabela `clinic_integrations` + RLS**: Task 3. ✅
- **Listar painéis no cadastro / selecionar / salvar token+painel / teste de conexão**: Tasks 5, 6. ✅
- **Leitura do funil ao vivo (sob demanda)**: `getLiveFunnel` (Task 5) + preview no form (Task 6). ✅
- **Sem credenciais no browser**: todas as chamadas Helena em Server Actions; token só decifrado no servidor. ✅
- **Nova env `HELENA_TOKEN_ENC_KEY`**: Task 2 (.env.example) + handoff (definir em `.env.local` e Vercel). ✅

Fora de escopo (Fases 3-4): fechamento mensal congelado/snapshots, motor de status aplicado, dashboards/gráficos/mapa, página de detalhe completa e lista de leads individuais.
