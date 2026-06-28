# Fase 3 — Snapshots Mensais, Motor de Status e Entrada Manual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir o histórico mensal de cada clínica (snapshots), classificar o status de saúde automaticamente por faixas de taxa (com override manual), congelar o mês ao virar (lazy), e oferecer uma grade editável estilo planilha para preencher as clínicas manuais.

**Architecture:** Tabela `monthly_snapshots` guarda um registro por clínica por mês. O motor de status é uma função pura que aplica `status_rules` (semeadas na Fase 1) sobre a taxa. O mês corrente das clínicas `auto` é lido ao vivo da Helena (Fase 2) e NÃO é gravado até virar o mês; ao detectar um mês novo no acesso, um "freeze" lazy lê a Helena uma última vez do mês anterior e grava o snapshot. Clínicas `manual` têm os números digitados numa grade que grava direto em `monthly_snapshots`.

**Tech Stack:** Next.js (App Router) Server Actions, TypeScript, Supabase (Postgres), Vitest.

## Global Constraints

- **Tema escuro prioritário; interface em pt-BR.**
- **Credenciais só no servidor** (o freeze de clínicas `auto` reusa as actions service_role da Fase 2).
- Chave de mês no formato **`YYYY-MM`** (ex.: `2026-06`), sempre em UTC.
- Funil canônico de 9 etapas e `CANONICAL_STEPS` já definidos na Fase 2; `status_rules` (5 faixas) e `funnel_steps` semeados na Fase 1.
- Taxa de conversão principal = **agendados ÷ leads** (0 quando leads=0).
- `monthly_snapshots` é dado comum (não credencial) → RLS padrão (authenticated full access, anon revogado), como na Fase 1.
- Um snapshot **congelado** (mês passado) é imutável pela UI; só o mês corrente é editável (manuais) ou ao vivo (auto).
- TDD para lógica pura (motor de status, helpers de mês, cálculo). Commits frequentes.

## File Structure (Fase 3)

```
src/lib/
├── snapshots/
│   ├── month.ts          # monthKey(date), isPastMonth(key, now), prevMonth(key)
│   ├── status.ts         # resolveStatus({ rate, override, rules }) -> { label, color } | null
│   └── actions.ts        # upsertManualSnapshot / listSnapshotsForMonth / setStatusOverride / ensureFrozen
├── helena/
│   └── (reuso de client.ts + funnel.ts da Fase 2)
└── clinics/
    └── integration-actions.ts  # (modificado) + getFunnelForMonth(clinicId, yearMonth)
supabase/migrations/
└── 0004_monthly_snapshots.sql
src/app/(app)/mensal/
└── page.tsx              # grade mensal editável (manuais) + leitura (auto/congelados)
src/components/snapshots/
└── monthly-grid.tsx      # grade estilo planilha (client)
```

---

### Task 1: Migração `monthly_snapshots`

**Files:**
- Create: `supabase/migrations/0004_monthly_snapshots.sql`

**Interfaces:**
- Consumes: `clinics` (FK), enum de origem.
- Produces: tabela `monthly_snapshots` + enum `snapshot_source`.

- [ ] **Step 1: Escrever a migração**

`supabase/migrations/0004_monthly_snapshots.sql`:
```sql
create type snapshot_source as enum ('auto', 'manual');

create table monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  year_month text not null,              -- 'YYYY-MM' (UTC)
  leads int not null default 0,
  scheduled int not null default 0,
  rate numeric not null default 0,       -- agendados/leads (fração 0..1)
  status text,                           -- rótulo calculado no congelamento
  status_override text,                  -- sobrescreve o status calculado
  source snapshot_source not null,
  revenue numeric not null default 0,    -- só clínicas auto (faturamento)
  step_counts jsonb,                     -- contagem das 9 etapas (auto)
  frozen boolean not null default false, -- true quando o mês foi congelado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, year_month)
);

create index monthly_snapshots_year_month_idx on monthly_snapshots (year_month);

create trigger monthly_snapshots_updated_at before update on monthly_snapshots
  for each row execute function set_updated_at();

alter table monthly_snapshots enable row level security;
revoke all on monthly_snapshots from anon;
create policy monthly_snapshots_authenticated_all on monthly_snapshots
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Aplicar a migração**

Via SQL Editor do projeto (read-only desligado) ou Supabase MCP `apply_migration`. Projeto de produção está em outra conta → SQL disponível para o usuário rodar (handoff).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_monthly_snapshots.sql
git commit -m "feat: tabela monthly_snapshots (histórico mensal)"
```

---

### Task 2: Helpers de mês (lógica pura)

**Files:**
- Create: `src/lib/snapshots/month.ts`
- Test: `tests/snapshot-month.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `monthKey(date: Date): string` — `'YYYY-MM'` em UTC.
  - `prevMonth(key: string): string` — mês anterior (`'2026-01'` → `'2025-12'`).
  - `isPastMonth(key: string, now: Date): boolean` — true se `key` é anterior ao mês de `now` (UTC).
  - `monthRangeUtc(key: string): { after: string; before: string }` — intervalo ISO `[início, próximo mês)` do mês `key`.

- [ ] **Step 1: Escrever os testes falhando**

`tests/snapshot-month.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { monthKey, prevMonth, isPastMonth, monthRangeUtc } from "@/lib/snapshots/month";

describe("month helpers", () => {
  it("monthKey formata YYYY-MM em UTC", () => {
    expect(monthKey(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
  it("prevMonth atravessa a virada de ano", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-07")).toBe("2026-06");
  });
  it("isPastMonth compara corretamente", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    expect(isPastMonth("2026-05", now)).toBe(true);
    expect(isPastMonth("2026-06", now)).toBe(false);
    expect(isPastMonth("2026-07", now)).toBe(false);
  });
  it("monthRangeUtc devolve intervalo meio-aberto", () => {
    const r = monthRangeUtc("2026-06");
    expect(r.after).toBe("2026-06-01T00:00:00.000Z");
    expect(r.before).toBe("2026-07-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- snapshot-month`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/snapshots/month.ts`:
```typescript
export function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return monthKey(d);
}

export function isPastMonth(key: string, now: Date): boolean {
  return key < monthKey(now);
}

export function monthRangeUtc(key: string): { after: string; before: string } {
  const [y, m] = key.split("-").map(Number);
  const after = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const before = new Date(Date.UTC(y, m, 1)).toISOString();
  return { after, before };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- snapshot-month`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/snapshots/month.ts tests/snapshot-month.test.ts
git commit -m "feat: helpers de mês para snapshots"
```

---

### Task 3: Motor de status (lógica pura)

**Files:**
- Create: `src/lib/snapshots/status.ts`
- Test: `tests/snapshot-status.test.ts`

**Interfaces:**
- Consumes: faixas de `status_rules` no formato `{ label: string; rate_min: number; rate_max: number; color: string }`.
- Produces:
  - `type StatusRule = { label: string; rate_min: number; rate_max: number; color: string }`
  - `resolveStatus(args: { rate: number; override?: string | null; rules: StatusRule[] }): { label: string; color: string } | null`
  - Regra: se `override` truthy, retorna `{ label: override, color: cor da regra de mesmo label se existir, senão "#9ca3af" }`. Senão, encontra a regra onde `rate_min <= rate < rate_max`; se nenhuma, retorna `null`.

- [ ] **Step 1: Escrever os testes falhando**

`tests/snapshot-status.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status";

const rules: StatusRule[] = [
  { label: "Risco Churn", rate_min: 0.0, rate_max: 0.05, color: "#9ca3af" },
  { label: "Preocupante", rate_min: 0.05, rate_max: 0.09, color: "#f97316" },
  { label: "Ok/Atenção", rate_min: 0.09, rate_max: 0.11, color: "#eab308" },
  { label: "Bom", rate_min: 0.11, rate_max: 0.13, color: "#3b82f6" },
  { label: "Ótimo", rate_min: 0.13, rate_max: 1.01, color: "#22c55e" },
];

describe("resolveStatus", () => {
  it("classifica pela faixa de taxa", () => {
    expect(resolveStatus({ rate: 0.02, rules })).toEqual({ label: "Risco Churn", color: "#9ca3af" });
    expect(resolveStatus({ rate: 0.12, rules })).toEqual({ label: "Bom", color: "#3b82f6" });
    expect(resolveStatus({ rate: 0.30, rules })).toEqual({ label: "Ótimo", color: "#22c55e" });
  });
  it("limite inferior inclusivo, superior exclusivo", () => {
    expect(resolveStatus({ rate: 0.05, rules })?.label).toBe("Preocupante");
    expect(resolveStatus({ rate: 0.09, rules })?.label).toBe("Ok/Atenção");
  });
  it("override tem precedência e herda a cor da regra de mesmo nome", () => {
    expect(resolveStatus({ rate: 0.30, override: "Risco Churn", rules })).toEqual({ label: "Risco Churn", color: "#9ca3af" });
  });
  it("override sem regra correspondente usa cor neutra", () => {
    expect(resolveStatus({ rate: 0.30, override: "Suspenso", rules })).toEqual({ label: "Suspenso", color: "#9ca3af" });
  });
  it("retorna null quando nenhuma faixa casa e não há override", () => {
    expect(resolveStatus({ rate: 5, rules })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- snapshot-status`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/snapshots/status.ts`:
```typescript
export type StatusRule = { label: string; rate_min: number; rate_max: number; color: string };

export function resolveStatus(args: {
  rate: number;
  override?: string | null;
  rules: StatusRule[];
}): { label: string; color: string } | null {
  const { rate, override, rules } = args;
  if (override) {
    const match = rules.find((r) => r.label === override);
    return { label: override, color: match?.color ?? "#9ca3af" };
  }
  const rule = rules.find((r) => rate >= r.rate_min && rate < r.rate_max);
  return rule ? { label: rule.label, color: rule.color } : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- snapshot-status`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/snapshots/status.ts tests/snapshot-status.test.ts
git commit -m "feat: motor de status por faixas de taxa"
```

---

### Task 4: Leitura de funil por mês (Helena, mês arbitrário)

**Files:**
- Modify: `src/lib/clinics/integration-actions.ts`

**Interfaces:**
- Consumes: `getPanelWithSteps`/`listCards` (Fase 2), `buildLiveFunnel` (Fase 2), `monthRangeUtc` (Task 2), `createServiceClient`, gate de auth (Fase 2).
- Produces:
  - `getFunnelForMonth(clinicId: string, yearMonth: string): Promise<{ ok: true; funnel: ReturnType<typeof buildLiveFunnel> } | { ok: false; error: string }>` — igual ao `getLiveFunnel`, mas usa o intervalo do mês `yearMonth` em vez do mês corrente. Refatorar `getLiveFunnel` para delegar a `getFunnelForMonth(clinicId, monthKey(now))`.

- [ ] **Step 1: Implementar `getFunnelForMonth` e refatorar `getLiveFunnel`**

Em `src/lib/clinics/integration-actions.ts`, adicionar (mantendo o gate de auth e o uso de `createServiceClient`):
```typescript
import { monthKey, monthRangeUtc } from "@/lib/snapshots/month";

export async function getFunnelForMonth(clinicId: string, yearMonth: string) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

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
    const cards = await listCards(token, panelId, monthRangeUtc(yearMonth));
    return { ok: true as const, funnel: buildLiveFunnel(steps, cards) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao ler o funil" };
  }
}
```
Refatorar `getLiveFunnel(clinicId)` para `return getFunnelForMonth(clinicId, monthKey(new Date()))` (remover a duplicação; manter o gate de auth dentro de `getFunnelForMonth`).

- [ ] **Step 2: Verificar build**

Run: `npm run build` e `npm test`
Expected: compila; os 25+ testes seguem verdes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/clinics/integration-actions.ts
git commit -m "feat: leitura de funil Helena por mês arbitrário"
```

---

### Task 5: Server Actions de snapshots (manual, listagem, override, freeze lazy)

**Files:**
- Create: `src/lib/snapshots/actions.ts`

**Interfaces:**
- Consumes: `createClient` (Supabase server, authenticated; `monthly_snapshots` é dado comum sob RLS — usar o client autenticado, NÃO o service client), `resolveStatus` (Task 3), `monthKey`/`isPastMonth`/`prevMonth` (Task 2), `getFunnelForMonth` (Task 4), `listClinics` (Fase 1).
- Produces (Server Actions, `"use server"`):
  - `upsertManualSnapshot(clinicId: string, yearMonth: string, leads: number, scheduled: number): Promise<{ ok: true } | { ok: false; error: string }>` — calcula `rate`, faz upsert com `source='manual'`. Bloqueia se `isPastMonth(yearMonth)` e o registro já está `frozen` (não edita mês congelado).
  - `listSnapshotsForMonth(yearMonth: string): Promise<{ clinicId: string; ... }[]>` — devolve os snapshots gravados desse mês.
  - `setStatusOverride(clinicId: string, yearMonth: string, override: string | null): Promise<{ ok: true } | { ok: false; error: string }>`.
  - `ensureFrozen(clinicId: string, panelMode: "auto" | "manual"): Promise<void>` — para clínicas `auto`: para cada mês passado entre a criação da integração e o mês corrente sem snapshot `frozen`, lê `getFunnelForMonth` e grava o snapshot (`source='auto'`, `frozen=true`, `revenue`, `step_counts`, `status` calculado). Para `manual`: marca como `frozen=true` os snapshots de meses passados já existentes. Idempotente.

- [ ] **Step 1: Implementar as actions**

`src/lib/snapshots/actions.ts` (`"use server"`), seguindo as interfaces acima. Pontos-chave:
  - `upsertManualSnapshot`: `rate = leads === 0 ? 0 : scheduled / leads`; `upsert` por `(clinic_id, year_month)`; recusar edição se o registro existente tem `frozen = true`.
  - `ensureFrozen` (auto): buscar a integração para saber desde quando existe; iterar dos meses passados; pular os que já têm `frozen=true`; para cada faltante, `getFunnelForMonth(clinicId, ym)` → gravar snapshot com `leads/scheduled/rate/revenue/step_counts`, `status` via `resolveStatus` (carregar `status_rules` do banco), `frozen=true`.
  - Carregar `status_rules` uma vez (`select * from status_rules order by position`) para resolver status no freeze.
  - Erros tratados retornando `{ ok: false }` (nas que retornam objeto) ou silenciando no `ensureFrozen` por clínica (uma clínica que falha não derruba as outras — logar e seguir).

- [ ] **Step 2: Verificar build**

Run: `npm run build` e `npm test`
Expected: compila; testes verdes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/snapshots/actions.ts
git commit -m "feat: server actions de snapshots (manual, override, freeze lazy)"
```

---

### Task 6: Grade mensal editável (UI)

**Files:**
- Create: `src/app/(app)/mensal/page.tsx`, `src/components/snapshots/monthly-grid.tsx`
- Modify: `src/components/app-nav.tsx` (adicionar link "Mensal")

**Interfaces:**
- Consumes: `listClinics` (Fase 1), `listSnapshotsForMonth`/`upsertManualSnapshot`/`setStatusOverride`/`ensureFrozen` (Task 5), `getLiveFunnel` (Fase 2, mês corrente das auto), `resolveStatus` + `status_rules`, `monthKey` (Task 2).
- Produces: rota `/mensal` — seletor de mês (default mês corrente); grade com todas as clínicas. Para clínicas **manuais**: células editáveis de leads e agendados (salvam via `upsertManualSnapshot`), com taxa e status calculados ao vivo. Para clínicas **auto**: no mês corrente mostra os números ao vivo (via `getLiveFunnel`, somente leitura); em meses passados mostra o snapshot congelado. Status colorido conforme `resolveStatus`. Ao abrir a página, dispara `ensureFrozen` para congelar meses passados pendentes.

- [ ] **Step 1: Página servidor `/mensal`**

`src/app/(app)/mensal/page.tsx` (server component): lê `searchParams.month` (await; default `monthKey(new Date())`), carrega `listClinics()`, `listSnapshotsForMonth(month)` e `status_rules`; para clínicas auto no mês corrente, busca `getLiveFunnel` (em paralelo, tolerando erro por clínica). Dispara `ensureFrozen` para cada clínica antes de montar (ou via uma action única que itera). Passa tudo para `<MonthlyGrid />`.

- [ ] **Step 2: Componente `monthly-grid.tsx`**

`"use client"`. Renderiza uma tabela (estilo planilha): colunas Clínica, Leads, Agendados, Taxa, Status. Linhas manuais com `<input type="number">` em Leads/Agendados que, ao `onBlur`/Enter, chamam `upsertManualSnapshot` (via `useTransition`); recalcula taxa/status localmente com `resolveStatus`. Linhas auto/congeladas são somente leitura. Status renderizado como badge com a cor de `resolveStatus`. Seletor de mês no topo que navega para `/mensal?month=YYYY-MM`. Tudo dark + pt-BR.

- [ ] **Step 3: Link na navegação**

Adicionar item "Mensal" (`/mensal`) em `src/components/app-nav.tsx`.

- [ ] **Step 4: Verificar**

Run: `npm run build` e `npm test`
Expected: compila (rota dinâmica); testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/mensal src/components/snapshots/monthly-grid.tsx src/components/app-nav.tsx
git commit -m "feat: grade mensal editável (entrada manual + visão do mês)"
```

---

## Self-Review (cobertura — Fase 3)

- **Tabela `monthly_snapshots` + RLS**: Task 1. ✅
- **Histórico mensal (snapshot por clínica/mês)**: Tasks 1, 5. ✅
- **Motor de status automático por faixas + override**: Task 3 (puro) + aplicação nas actions/UI (Tasks 5, 6). ✅
- **Fechamento mensal lazy (congela ao acessar mês novo)**: `ensureFrozen` (Task 5) disparado na página (Task 6). ✅
- **Leitura do mês corrente ao vivo (auto) e meses passados congelados**: Tasks 4, 6. ✅
- **Entrada manual em grade estilo planilha**: Task 6. ✅
- **Sem credenciais no browser**: freeze de auto reusa as actions service_role + gate de auth da Fase 2; `monthly_snapshots` é dado comum sob RLS. ✅

Fora de escopo (Fase 4): dashboards/gráficos, ranking visual, mapa da carteira, comparativo entre meses, página de detalhe da clínica com funil visual e lista de leads. A grade `/mensal` é funcional/utilitária; o capricho visual (referências do usuário) vem na Fase 4.
