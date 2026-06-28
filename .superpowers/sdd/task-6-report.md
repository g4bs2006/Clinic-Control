# Task 6 Report: Grade mensal editável (UI)

## O que foi implementado

### 1. `src/app/(app)/mensal/page.tsx` (novo — server component)

- `export const dynamic = "force-dynamic"` — evita static rendering (cookies/searchParams)
- Lê `searchParams` como Promise (await); default `monthKey(new Date())`
- Carrega `listClinics()`, `listSnapshotsForMonth(month)`, e `status_rules` via Supabase server client em paralelo
- Dispara `ensureFrozen(clinic.id, clinic.mode)` para todas as clínicas via `Promise.all`
- Para clínicas AUTO no mês corrente: `getLiveFunnel()` via `Promise.allSettled` (falhas por clínica toleradas)
- Constrói `GridRow[]`: `editable = manual && (isCurrentMonth || !frozen)`
- Renderiza `<MonthlyGrid month rows rules />`

### 2. `src/components/snapshots/monthly-grid.tsx` (novo — client component)

- `"use client"` — sem imports server-only; `resolveStatus` e tipos são puros
- Seletor de mês: `<input type="month">` + botões prev/next usando `useRouter().push('/mensal?month=...')`
- shadcn Table: colunas Clínica, Cidade/UF, Leads, Agendados, Taxa, Status
- **EditableRow**: `<input type="number">` para leads/agendados; `onBlur`/Enter chama `upsertManualSnapshot` via `useTransition`; taxa e status badge recalculados localmente com `resolveStatus`; `toast.success/error`
- **Linhas read-only**: números como texto; em-dash para null
- `StatusBadge`: cor de `resolveStatus().color`; texto claro/escuro calculado por luminância
- Taxa em pt-BR via `toLocaleString('pt-BR')` (ex: `12,5%`)
- `isPending` do `useTransition` desabilita inputs durante save

### 3. `src/components/app-nav.tsx` (modificado)

- Adicionado `{ href: "/mensal", label: "Mensal" }` ao array `navItems`

## Server/Client Split

- **Server** (`page.tsx`): auth Supabase, queries (clinics, snapshots, status_rules, live funnel), side effect ensureFrozen, construção do model de linhas
- **Client** (`monthly-grid.tsx`): UI, navegação de mês, edição inline, estado local (leads/scheduled por linha), mutação via server action, recalculate rate/status no cliente
- Server actions (`upsertManualSnapshot`, `ensureFrozen`) permanecem em `@/lib/snapshots/actions` — chamadas direto do cliente como async functions

## Build + Testes

- `npm run build`: compilou com sucesso (Turbopack, TypeScript limpo); `/mensal` aparece como `ƒ` (dynamic)
- `npm test`: 9 test files, 34/34 testes passaram (sem regressões)

## Arquivos alterados

- **Criado**: `src/app/(app)/mensal/page.tsx`
- **Criado**: `src/components/snapshots/monthly-grid.tsx`
- **Modificado**: `src/components/app-nav.tsx`

## Self-Review

- [x] `/mensal` renderiza a grade
- [x] Seletor de mês navega via `useRouter`
- [x] Células manuais editáveis: blur/Enter salva, taxa/status ao vivo
- [x] Linhas auto somente leitura (ao vivo no corrente / congeladas em passados)
- [x] `ensureFrozen` disparado no load para todas as clínicas
- [x] Status badge colorido com `resolveStatus(...).color`
- [x] Link "Mensal" adicionado ao nav
- [x] Build + 34 testes verdes
- [x] pt-BR (taxas, rótulo do mês, toasts)
- [x] Dark theme (classes Tailwind do design system existente)
- [x] YAGNI: sem charts, sem mapa, sem UI de override (TODO no footer da grid)

## Concerns

- **Sem DB ao vivo nesta sessão**: validado via build + unit tests. A página exige Supabase em runtime; `force-dynamic` garante que não haja erro de static generation.
- **Status override editing**: pulado conforme orientação da task. Deixado como comentário TODO no componente.
- **`useTransition` + EditableRow**: `startTransition(() => {})` era um workaround incorreto — removido na revisão final abaixo.

---

## Fix Note — Final Review (2026-06-28)

Aplicados três ajustes via revisão final (`fase-3-snapshots-status`):

### Finding 1 — Pending state por linha (Importante)
- Removido `useTransition` global no `MonthlyGrid` e props `isPending`/`onSaveStart`/`onSaveDone` do `EditableRow`.
- `EditableRow` agora tem `const [saving, setSaving] = useState(false)` local; `handleSave` faz `setSaving(true)/finally setSaving(false)`.
- `disabled={saving}` afeta apenas os inputs daquela linha.
- `router.refresh()` chamado dentro do `EditableRow` após save bem-sucedido (importado via `useRouter()`).

### Finding 2 — Parsing inteiro seguro (Importante)
- Extraída helper `parseSafeInt(raw)`: `""` → `null`; `Math.floor(Number(raw))` com guard `isFinite && >= 0`; inválidos/negativos/floats → `null`.
- `handleSave` retorna cedo (`return`) se `leads === null || scheduled === null` — não envia valores inválidos ao servidor.
- `onChange` dos inputs usa `parseSafeInt` ao invés de `Number(raw)`.

### Finding 3 — Valida `month` searchParam (Menor)
- `mensal/page.tsx`: substituído `params.month ?? monthKey(now)` por guard `/^\d{4}-\d{2}$/` — valores inválidos caem no `monthKey(now)`.

### Verificação
- `npm run build`: compilou limpo (TypeScript ok, `/mensal` dynamic).
- `npm test`: 9 arquivos, 34/34 testes verdes.
