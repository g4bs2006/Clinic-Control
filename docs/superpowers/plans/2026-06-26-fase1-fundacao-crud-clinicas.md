# Fase 1 — Fundação + CRUD de Clínicas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base do sistema (Next.js + Supabase + auth interno + tema escuro) e o CRUD completo de clínicas com geocodificação de endereço.

**Architecture:** App standalone Next.js (App Router, TypeScript). Dados em Supabase (Postgres). Server Actions fazem o acesso ao banco. Auth interno via Supabase Auth (email/senha). Geocodificação via Nominatim (OpenStreetMap, sem chave). Lógica pura (validação, derivação de região, parsing de geocoding) testada com Vitest em TDD.

**Tech Stack:** Next.js 15+, TypeScript, Tailwind CSS, shadcn/ui (dark mode), `@supabase/supabase-js` + `@supabase/ssr`, Zod, Vitest.

## Global Constraints

- **Tema escuro é prioridade** — toda UI nasce em dark mode.
- Idioma da interface: **português (Brasil)**.
- O `helena_token` (fases futuras) nunca trafega para o browser — acesso a credenciais e a APIs externas só em Server Actions / Route Handlers. Nesta fase, nenhuma credencial sensível é exposta no client.
- Caminho do projeto: `C:\Users\T-GAMER\Desktop\Contact\gestao-clinicas`.
- Funil padrão de 9 etapas (seed, ordem fixa): Leads, Agendados, Não Agendados, Reagendados, Cancelados, Faltosos, Orçamento em Aberto, Compareceram e Não Fecharam, Compareceram e Fecharam.
- TDD para toda lógica pura. Commits frequentes (um por task no mínimo).

## File Structure (Fase 1)

```
gestao-clinicas/
├── package.json, tsconfig.json, next.config.ts, vitest.config.ts
├── .env.local                      # URL + chaves Supabase (não commitado)
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root layout, dark, pt-BR
│   │   ├── globals.css             # tailwind + tokens dark
│   │   ├── login/page.tsx          # tela de login
│   │   ├── (app)/layout.tsx        # layout autenticado + nav lateral
│   │   ├── (app)/page.tsx          # placeholder home (vira dashboard na Fase 4)
│   │   └── (app)/clinicas/         # CRUD: list, nova, [id]/editar
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # browser client
│   │   │   ├── server.ts           # server client (cookies)
│   │   │   └── middleware.ts       # refresh de sessão
│   │   ├── clinics/
│   │   │   ├── schema.ts           # Zod + tipos
│   │   │   ├── region.ts           # derivação de região a partir do estado
│   │   │   └── actions.ts          # server actions CRUD
│   │   └── geocoding/
│   │       └── nominatim.ts        # geocodificar endereço -> lat/lng
│   ├── components/ui/              # shadcn
│   └── middleware.ts               # protege rotas (app)
├── supabase/migrations/            # SQL versionado
└── tests/                          # testes Vitest (lógica pura)
```

---

### Task 1: Scaffold do projeto Next.js + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(app)/page.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: projeto executável (`npm run dev`), runner de testes (`npm test` → `vitest run`).

- [ ] **Step 1: Inicializar o app Next.js na pasta atual**

Run (na pasta `gestao-clinicas`, que já existe e tem git):
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
Aceitar sobrescrever se perguntar (a pasta só tem `docs/` e `.gitignore`/git). Garantir que `docs/` permanece.

- [ ] **Step 2: Instalar Vitest e dependências de teste**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 4: Adicionar script de teste ao `package.json`**

No bloco `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Escrever teste de fumaça**

`tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("roda o runner de testes", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `npm test`
Expected: 1 teste passa (`smoke`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Vitest"
```

---

### Task 2: Tema escuro base + layout raiz em pt-BR

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: projeto da Task 1.
- Produces: app renderiza em dark mode por padrão, `<html lang="pt-BR">`.

- [ ] **Step 1: Definir dark como padrão no layout raiz**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestão de Clínicas — Contact.IA",
  description: "Carteira de clínicas, funil e performance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Definir tokens de cor dark (navy/teal) no `globals.css`**

Acrescentar ao `globals.css` (após os imports do Tailwind) as variáveis CSS para `.dark` usando a paleta navy/teal das referências (ex.: `--background: 222 47% 11%`, `--foreground: 210 40% 98%`, `--primary: 174 72% 56%`). Mapear `bg-background`, `text-foreground`, `bg-primary` via `@theme`/tokens do Tailwind v4 conforme o template gerado.

- [ ] **Step 3: Verificar visualmente**

Run: `npm run dev` e abrir `http://localhost:3000` — fundo escuro navy aplicado.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: tema escuro base + layout pt-BR"
```

---

### Task 3: shadcn/ui + navegação lateral

**Files:**
- Create: `components.json` (via CLI), `src/components/ui/*`, `src/app/(app)/layout.tsx`, `src/components/app-nav.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: tema dark da Task 2.
- Produces: layout autenticado `(app)` com nav lateral (links: Início, Clínicas). Componentes shadcn `button`, `input`, `label`, `card`, `table`, `select`, `switch`, `sonner` disponíveis.

- [ ] **Step 1: Inicializar shadcn**

Run:
```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card table select switch sonner
```

- [ ] **Step 2: Criar o componente de navegação**

`src/components/app-nav.tsx` — nav lateral fixa com links para `/` (Início) e `/clinicas` (Clínicas), usando `next/link` e destacando a rota ativa via `usePathname`.

- [ ] **Step 3: Criar o layout do grupo `(app)`**

`src/app/(app)/layout.tsx` — grid com `<AppNav />` à esquerda e `{children}` à direita; fundo dark.

- [ ] **Step 4: Placeholder da home**

`src/app/(app)/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl font-semibold">Início</h1><p className="text-muted-foreground">Dashboard chega na Fase 4.</p></main>;
}
```

- [ ] **Step 5: Verificar**

Run: `npm run dev` → `/` mostra nav lateral + título.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: shadcn + navegação lateral"
```

---

### Task 4: Supabase — clients e variáveis de ambiente

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `.env.local`, `.env.example`

**Interfaces:**
- Consumes: nada do app ainda.
- Produces:
  - `createClient()` (browser) — em `client.ts`
  - `createClient()` (server, async, usa cookies) — em `server.ts`
  - `updateSession(request)` — em `middleware.ts`

- [ ] **Step 1: Criar/identificar o projeto Supabase**

Criar um projeto no painel Supabase (ou via Supabase MCP) e copiar `Project URL` e a chave `publishable`/`anon`. Não há teste automatizado aqui — é setup.

- [ ] **Step 2: Instalar SDKs**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Variáveis de ambiente**

`.env.local` (não commitar — já coberto pelo `.gitignore`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
`.env.example` com as mesmas chaves vazias (este sim commitado).

- [ ] **Step 4: Client de browser**

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Client de servidor**

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch {
            // chamado de um Server Component — ignorável com middleware ativo
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Middleware de sessão**

`src/lib/supabase/middleware.ts` com `updateSession(request)` (padrão `@supabase/ssr`: cria response, instancia `createServerClient` com cookies do request/response, chama `supabase.auth.getUser()`, retorna response). `src/middleware.ts` exporta `middleware` chamando `updateSession` e um `matcher` que cobre tudo exceto assets estáticos.

- [ ] **Step 7: Verificar build**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: clients Supabase + middleware de sessão"
```

---

### Task 5: Migração do schema (clinics + tabelas de referência)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Consumes: projeto Supabase da Task 4.
- Produces: tabela `clinics` e tabelas de referência `funnel_steps`, `status_rules` (com seeds). Enums `clinic_mode` (`auto`,`manual`) e `contract_status` (`active`,`suspended`,`archived`).

- [ ] **Step 1: Escrever a migração SQL**

`supabase/migrations/0001_init.sql`:
```sql
create type clinic_mode as enum ('auto', 'manual');
create type contract_status as enum ('active', 'suspended', 'archived');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  state text,            -- UF (2 letras)
  region text,           -- derivada do estado
  lat double precision,
  lng double precision,
  mode clinic_mode not null default 'manual',
  contract_status contract_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table funnel_steps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  counts_as_scheduling boolean not null default false,
  counts_as_closing boolean not null default false
);

create table status_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  rate_min numeric not null,   -- fração 0..1
  rate_max numeric not null,
  color text not null,
  position int not null
);

-- Seed: 9 etapas do funil padrão
insert into funnel_steps (name, position, counts_as_scheduling, counts_as_closing) values
  ('Leads', 1, false, false),
  ('Agendados', 2, true, false),
  ('Não Agendados', 3, false, false),
  ('Reagendados', 4, true, false),
  ('Cancelados', 5, false, false),
  ('Faltosos', 6, false, false),
  ('Orçamento em Aberto', 7, false, false),
  ('Compareceram e Não Fecharam', 8, false, false),
  ('Compareceram e Fecharam', 9, false, true);

-- Seed: faixas de status iniciais (taxa = agendados/leads)
insert into status_rules (label, rate_min, rate_max, color, position) values
  ('Risco Churn', 0.00, 0.05, '#9ca3af', 1),
  ('Preocupante', 0.05, 0.09, '#f97316', 2),
  ('Ok/Atenção',  0.09, 0.11, '#eab308', 3),
  ('Bom',         0.11, 0.13, '#3b82f6', 4),
  ('Ótimo',       0.13, 1.01, '#22c55e', 5);

-- updated_at automático
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger clinics_updated_at before update on clinics
  for each row execute function set_updated_at();
```

- [ ] **Step 2: Aplicar a migração**

Aplicar via Supabase MCP (`apply_migration` com o conteúdo acima) ou `supabase db push`. 

- [ ] **Step 3: Verificar**

Listar tabelas (Supabase MCP `list_tables` ou SQL `select * from funnel_steps order by position`) e confirmar as 9 etapas e 5 faixas.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: schema inicial (clinics + funnel_steps + status_rules)"
```

---

### Task 6: Derivação de região a partir da UF (TDD)

**Files:**
- Create: `src/lib/clinics/region.ts`
- Test: `tests/region.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `regionFromState(uf: string): string` — retorna a região brasileira (`Norte`, `Nordeste`, `Centro-Oeste`, `Sudeste`, `Sul`) ou `"Desconhecida"` para UF inválida. Case-insensitive.

- [ ] **Step 1: Escrever os testes falhando**

`tests/region.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { regionFromState } from "@/lib/clinics/region";

describe("regionFromState", () => {
  it("mapeia SP para Sudeste", () => expect(regionFromState("SP")).toBe("Sudeste"));
  it("mapeia BA para Nordeste", () => expect(regionFromState("ba")).toBe("Nordeste"));
  it("mapeia RS para Sul", () => expect(regionFromState("RS")).toBe("Sul"));
  it("mapeia GO para Centro-Oeste", () => expect(regionFromState("GO")).toBe("Centro-Oeste"));
  it("mapeia AM para Norte", () => expect(regionFromState("AM")).toBe("Norte"));
  it("retorna Desconhecida para UF inválida", () => expect(regionFromState("XX")).toBe("Desconhecida"));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- region`
Expected: FAIL (`regionFromState is not defined`).

- [ ] **Step 3: Implementar**

`src/lib/clinics/region.ts`:
```typescript
const REGIONS: Record<string, string> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

export function regionFromState(uf: string): string {
  return REGIONS[(uf ?? "").trim().toUpperCase()] ?? "Desconhecida";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- region`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: derivação de região a partir da UF"
```

---

### Task 7: Schema de validação da clínica (Zod, TDD)

**Files:**
- Create: `src/lib/clinics/schema.ts`
- Test: `tests/clinic-schema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `clinicInputSchema` (Zod) e tipo `ClinicInput`
  - Campos: `name` (obrigatório, min 2), `address` opcional, `city` opcional, `state` opcional (2 letras), `mode` (`"auto"|"manual"`, default `"manual"`), `contract_status` (`"active"|"suspended"|"archived"`, default `"active"`).
  - Tipo `Clinic` = registro persistido (inclui `id`, `region`, `lat`, `lng`, `created_at`).

- [ ] **Step 1: Escrever os testes falhando**

`tests/clinic-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { clinicInputSchema } from "@/lib/clinics/schema";

describe("clinicInputSchema", () => {
  it("aceita entrada mínima válida", () => {
    const r = clinicInputSchema.safeParse({ name: "OB Clinic" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.mode).toBe("manual"); expect(r.data.contract_status).toBe("active"); }
  });
  it("rejeita nome curto", () => {
    expect(clinicInputSchema.safeParse({ name: "X" }).success).toBe(false);
  });
  it("rejeita UF com tamanho errado", () => {
    expect(clinicInputSchema.safeParse({ name: "Clínica", state: "São Paulo" }).success).toBe(false);
  });
  it("aceita mode auto", () => {
    const r = clinicInputSchema.safeParse({ name: "Clínica", mode: "auto" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- clinic-schema`
Expected: FAIL (`clinicInputSchema` não existe).

- [ ] **Step 3: Instalar Zod e implementar**

Run: `npm install zod`

`src/lib/clinics/schema.ts`:
```typescript
import { z } from "zod";

export const clinicInputSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2, "Use a UF com 2 letras").optional(),
  mode: z.enum(["auto", "manual"]).default("manual"),
  contract_status: z.enum(["active", "suspended", "archived"]).default("active"),
});

export type ClinicInput = z.infer<typeof clinicInputSchema>;

export type Clinic = ClinicInput & {
  id: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- clinic-schema`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: validação Zod da clínica"
```

---

### Task 8: Geocodificação via Nominatim (TDD com fetch mockado)

**Files:**
- Create: `src/lib/geocoding/nominatim.ts`
- Test: `tests/nominatim.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `geocodeAddress(query: string, fetchImpl?: typeof fetch): Promise<{ lat: number; lng: number } | null>`. Usa `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=...` com header `User-Agent`. Retorna `null` se vazio. `fetchImpl` injetável para teste.

- [ ] **Step 1: Escrever os testes falhando**

`tests/nominatim.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { geocodeAddress } from "@/lib/geocoding/nominatim";

describe("geocodeAddress", () => {
  it("retorna lat/lng do primeiro resultado", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "-23.55", lon: "-46.63" }],
    }) as unknown as typeof fetch;
    const r = await geocodeAddress("Av Paulista, São Paulo", fakeFetch);
    expect(r).toEqual({ lat: -23.55, lng: -46.63 });
  });
  it("retorna null quando não há resultados", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    expect(await geocodeAddress("rua inexistente zzz", fakeFetch)).toBeNull();
  });
  it("retorna null em erro HTTP", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => [] }) as unknown as typeof fetch;
    expect(await geocodeAddress("x", fakeFetch)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- nominatim`
Expected: FAIL (`geocodeAddress` não existe).

- [ ] **Step 3: Implementar**

`src/lib/geocoding/nominatim.ts`:
```typescript
export async function geocodeAddress(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": "gestao-clinicas/1.0 (contact.ia)" } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- nominatim`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: geocodificação via Nominatim"
```

---

### Task 9: Server Actions de CRUD de clínicas

**Files:**
- Create: `src/lib/clinics/actions.ts`

**Interfaces:**
- Consumes: `createClient()` (server, Task 4), `clinicInputSchema`/`Clinic` (Task 7), `regionFromState` (Task 6), `geocodeAddress` (Task 8).
- Produces (todas Server Actions, `"use server"`):
  - `listClinics(): Promise<Clinic[]>` — exclui `contract_status = 'archived'` por padrão.
  - `getClinic(id: string): Promise<Clinic | null>`
  - `createClinic(input: ClinicInput): Promise<{ ok: true; id: string } | { ok: false; error: string }>`
  - `updateClinic(id: string, input: ClinicInput): Promise<{ ok: true } | { ok: false; error: string }>`
  - `archiveClinic(id: string): Promise<{ ok: true } | { ok: false; error: string }>` — seta `contract_status='archived'`.

Regras: `create`/`update` validam com `clinicInputSchema`, derivam `region` via `regionFromState(state)`, e geocodificam (`geocodeAddress("<address>, <city> <state>")`) preenchendo `lat`/`lng` quando houver endereço. Após mutação, chamar `revalidatePath("/clinicas")`.

- [ ] **Step 1: Implementar as actions**

`src/lib/clinics/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clinicInputSchema, type ClinicInput, type Clinic } from "./schema";
import { regionFromState } from "./region";
import { geocodeAddress } from "@/lib/geocoding/nominatim";

async function geoFields(input: ClinicInput) {
  const region = input.state ? regionFromState(input.state) : null;
  let lat: number | null = null, lng: number | null = null;
  if (input.address) {
    const q = [input.address, input.city, input.state].filter(Boolean).join(", ");
    const geo = await geocodeAddress(q);
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }
  return { region, lat, lng };
}

export async function listClinics(): Promise<Clinic[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinics").select("*")
    .neq("contract_status", "archived")
    .order("name");
  return (data ?? []) as Clinic[];
}

export async function getClinic(id: string): Promise<Clinic | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clinics").select("*").eq("id", id).single();
  return (data as Clinic) ?? null;
}

export async function createClinic(input: ClinicInput) {
  const parsed = clinicInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .insert({ ...parsed.data, ...(await geoFields(parsed.data)) })
    .select("id").single();
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const, id: data.id as string };
}

export async function updateClinic(id: string, input: ClinicInput) {
  const parsed = clinicInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({ ...parsed.data, ...(await geoFields(parsed.data)) })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const };
}

export async function archiveClinic(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update({ contract_status: "archived" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const };
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: server actions CRUD de clínicas"
```

---

### Task 10: Autenticação (login + proteção de rotas)

**Files:**
- Create: `src/app/login/page.tsx`, `src/lib/auth/actions.ts`
- Modify: `src/lib/supabase/middleware.ts` (redirecionar não autenticado para `/login`)

**Interfaces:**
- Consumes: clients Supabase (Task 4).
- Produces: `signIn(formData)` e `signOut()` server actions; rota `/login`; middleware redireciona usuário sem sessão para `/login` (exceto a própria `/login`).

- [ ] **Step 1: Actions de auth**

`src/lib/auth/actions.ts`:
```typescript
"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?error=1");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Tela de login**

`src/app/login/page.tsx` — `<form action={signIn}>` com inputs `email` e `password` (shadcn `Input`/`Button`/`Card`), dark, e mensagem de erro quando `?error=1`.

- [ ] **Step 3: Proteção no middleware**

Em `src/lib/supabase/middleware.ts`, após `getUser()`: se `!user` e o path não começa com `/login`, redirecionar para `/login`.

- [ ] **Step 4: Criar um usuário interno de teste**

Criar um usuário no painel Supabase (Auth → Users) para login. Setup manual, sem teste automatizado.

- [ ] **Step 5: Verificar fluxo**

Run: `npm run dev` → acessar `/` sem sessão redireciona para `/login`; login válido leva para `/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: autenticação interna (login + proteção de rotas)"
```

---

### Task 11: Página de listagem de clínicas

**Files:**
- Create: `src/app/(app)/clinicas/page.tsx`, `src/components/clinics/clinic-table.tsx`

**Interfaces:**
- Consumes: `listClinics()` (Task 9).
- Produces: rota `/clinicas` listando clínicas em tabela (shadcn `Table`): nome, cidade/UF, região, modo (badge auto/manual), status do contrato, e ações (Editar, Arquivar). Botão "Nova clínica" → `/clinicas/nova`.

- [ ] **Step 1: Componente de tabela**

`src/components/clinics/clinic-table.tsx` — recebe `clinics: Clinic[]`, renderiza linhas com link de editar (`/clinicas/<id>/editar`) e botão Arquivar que chama `archiveClinic` (via `<form action>`). Estado vazio amigável quando não houver clínicas.

- [ ] **Step 2: Página (server component)**

`src/app/(app)/clinicas/page.tsx`:
```tsx
import Link from "next/link";
import { listClinics } from "@/lib/clinics/actions";
import { ClinicTable } from "@/components/clinics/clinic-table";
import { Button } from "@/components/ui/button";

export default async function ClinicasPage() {
  const clinics = await listClinics();
  return (
    <main className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clínicas</h1>
        <Button asChild><Link href="/clinicas/nova">Nova clínica</Link></Button>
      </div>
      <ClinicTable clinics={clinics} />
    </main>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npm run dev` → `/clinicas` carrega (vazia inicialmente).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: listagem de clínicas"
```

---

### Task 12: Formulário de criar/editar clínica

**Files:**
- Create: `src/components/clinics/clinic-form.tsx`, `src/app/(app)/clinicas/nova/page.tsx`, `src/app/(app)/clinicas/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createClinic`, `updateClinic`, `getClinic` (Task 9); `clinicInputSchema` (Task 7).
- Produces: formulário reutilizável de clínica com toggle de modo. Em **modo automático**, mostra um placeholder "Configuração da integração Helena chega na Fase 2" (sem campo de token ainda). Em sucesso, redireciona para `/clinicas` com toast.

- [ ] **Step 1: Componente de formulário (client)**

`src/components/clinics/clinic-form.tsx` — `"use client"`; campos: nome, endereço, cidade, UF, switch de modo (manual/auto), select de status do contrato. Recebe `defaultValues?: Clinic` e `onSubmit: (input: ClinicInput) => Promise<...>`. Usa `Switch` do shadcn; quando `mode === "auto"`, renderiza um aviso (`Card`) sobre a Fase 2. Exibe erro retornado pela action via `sonner`.

- [ ] **Step 2: Página "nova"**

`src/app/(app)/clinicas/nova/page.tsx` — renderiza `<ClinicForm />` ligado a `createClinic`; ao `ok`, `redirect("/clinicas")`.

- [ ] **Step 3: Página "editar"**

`src/app/(app)/clinicas/[id]/editar/page.tsx` — carrega `getClinic(id)` (404 se nulo), renderiza `<ClinicForm defaultValues={clinic} />` ligado a `updateClinic`.

- [ ] **Step 4: Verificar fluxo completo**

Run: `npm run dev` → criar uma clínica manual e uma "auto" (com aviso da Fase 2); ambas aparecem na lista; editar e arquivar funcionam; clínica com endereço recebe `lat`/`lng` (conferir no Supabase).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes (smoke, region, clinic-schema, nominatim) passam.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: formulário de criar/editar clínica"
```

---

## Self-Review (cobertura do spec — Fase 1)

- **App standalone Next.js + dark + pt-BR:** Tasks 1–3. ✅
- **Supabase + auth interno:** Tasks 4, 10. ✅
- **Schema (clinics + funnel_steps + status_rules seeds):** Task 5. ✅ (tabelas `clinic_integrations`, `monthly_snapshots`, `leads` ficam para as Fases 2–4, conforme decomposição.)
- **CRUD completo de clínicas:** Tasks 9, 11, 12. ✅
- **Toggle manual/auto no cadastro:** Task 12 (branch auto com placeholder; onboarding real da integração = Fase 2). ✅
- **Geocodificação do endereço → lat/lng:** Tasks 8, 9. ✅
- **Derivação de região:** Task 6. ✅
- **Sem mensalidade:** confirmado — nenhum campo financeiro no cadastro. ✅
- **Tema escuro prioridade:** Task 2 + componentes shadcn dark. ✅

Itens do spec deliberadamente fora desta fase (cobertos nas próximas): integração Helena/listagem de painéis (Fase 2), snapshots + motor de status aplicado + entrada manual de métricas (Fase 3), dashboards/gráficos/mapa/nível de lead (Fase 4).
