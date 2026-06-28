# Fase 4 — Dashboards, Gráficos, Mapa e Detalhe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **UI tasks devem usar a skill `frontend-design`** para garantir a qualidade visual; a lógica pura (agregações, métricas derivadas) segue TDD.

**Goal:** Entregar a camada visual da carteira: dashboard com KPIs e ranking, comparativo entre meses, mapa geográfico das clínicas por status/região, e a página de detalhe da clínica (funil, tendência, métricas derivadas, faturamento e leads) — tudo no tema dark sofisticado das referências do usuário.

**Architecture:** Uma camada de agregação server-side (`src/lib/portfolio/`) consolida, por mês, as linhas de cada clínica (snapshot congelado para meses passados; ao vivo via Helena para auto no mês corrente; manual para manuais) e os totais da carteira — reaproveitando Fases 2/3. As telas consomem essa camada. Gráficos com Recharts; mapa com react-leaflet (tiles dark gratuitos, sem chave). Métricas derivadas do funil são funções puras (TDD).

**Tech Stack:** Next.js (App Router, Server Components + Server Actions), TypeScript, Tailwind v4 (dark), shadcn (@base-ui), **Recharts**, **react-leaflet + leaflet**, Vitest.

## Global Constraints

- **Estética dark sofisticada (prioridade máxima desta fase).** Inspiração nas referências do usuário: painéis escuros navy/preto com leve profundidade (bordas sutis, brilho/acento teal-roxo), cards bem organizados em grid responsivo, **gauges radiais**, gráficos de linha/área e barras com gradiente/brilho, KPIs grandes em destaque, mapa com pontos luminosos. Copiar a ESTÉTICA, não os dados das imagens. Usar a skill `frontend-design` em todas as tasks de UI.
- Interface em **pt-BR**; números em formato pt-BR (`toLocaleString('pt-BR')`); taxa em `%`.
- Reaproveitar: `resolveStatus`/`StatusRule` (`@/lib/snapshots/status`), `monthKey`/`prevMonth`/`monthRangeUtc` (`@/lib/snapshots/month`), `listSnapshotsForMonth`/`ensureFrozen` (`@/lib/snapshots/actions`), `getLiveFunnel`/`getFunnelForMonth` (`@/lib/clinics/integration-actions`), `listClinics` (`@/lib/clinics/actions`), `CANONICAL_STEPS` (`@/lib/helena/funnel`).
- Taxa principal = agendados ÷ leads. Não introduzir novas tabelas nesta fase (lê o que já existe).
- Credenciais só no servidor (leitura de Helena continua via server actions já existentes).
- Bibliotecas gratuitas e sem chave de API. Tiles do mapa: provedor dark gratuito (ex.: CARTO dark_matter) — documentar a dependência externa de tiles.
- TDD para lógica pura (agregação da carteira, métricas derivadas do funil). Commits frequentes.

## File Structure (Fase 4)

```
src/lib/portfolio/
├── metrics.ts        # derivedMetrics(stepCounts) — comparecimento/fechamento/no-show (puro)
├── aggregate.ts      # summarize(rows) — KPIs da carteira + distribuição de status (puro)
└── data.ts           # getPortfolioForMonth(month), getClinicHistory(clinicId) (server)
src/components/dashboard/
├── kpi-card.tsx      # card de KPI (dark, número grande)
├── panel.tsx         # painel/superfície dark reutilizável
├── status-donut.tsx  # donut de distribuição de status (Recharts)
├── ranking-table.tsx # tabela-ranking colorida
├── trend-chart.tsx   # gráfico de linha/área de tendência mensal (Recharts)
└── funnel-view.tsx   # funil visual das 9 etapas
src/components/map/
└── portfolio-map.tsx # mapa react-leaflet (client, dynamic import, no SSR)
src/app/(app)/
├── page.tsx          # (substitui placeholder) dashboard da carteira
├── comparativo/page.tsx
├── mapa/page.tsx
└── clinicas/[id]/page.tsx   # detalhe da clínica
src/components/app-nav.tsx    # (modificado) + links Comparativo, Mapa
```

---

### Task 1: Dependências + primitivos de design dark

**Files:**
- Modify: `package.json` (deps), `src/app/globals.css` (tokens/utilitários de brilho se necessário)
- Create: `src/components/dashboard/panel.tsx`, `src/components/dashboard/kpi-card.tsx`

**Interfaces:**
- Consumes: tema dark da Fase 1.
- Produces: `<Panel>` (superfície dark com borda sutil/acento), `<KpiCard label value hint? trend? accent?>` (número grande em destaque). Recharts e react-leaflet instalados.

- [ ] **Step 1: Instalar dependências**

Run:
```bash
npm install recharts react-leaflet leaflet
npm install -D @types/leaflet
```

- [ ] **Step 2: Criar os primitivos (usar a skill frontend-design)**

Invoque `frontend-design`. Criar `Panel` e `KpiCard` no estilo das referências: fundo navy translúcido, borda `border-border`/leve glow, cantos arredondados, espaçamento generoso; `KpiCard` com rótulo `text-muted-foreground`, valor grande (`text-3xl`/`4xl` semibold) e acento de cor opcional. Sem dados fixos — componentes genéricos.

- [ ] **Step 3: Verificar build**

Run: `npm run build` e `npm test`
Expected: compila; testes seguem verdes.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/dashboard/panel.tsx src/components/dashboard/kpi-card.tsx src/app/globals.css
git commit -m "feat: deps (recharts/leaflet) + primitivos de painel dark"
```

---

### Task 2: Métricas derivadas + agregação da carteira (lógica pura + data layer)

**Files:**
- Create: `src/lib/portfolio/metrics.ts`, `src/lib/portfolio/aggregate.ts`, `src/lib/portfolio/data.ts`
- Test: `tests/portfolio-metrics.test.ts`, `tests/portfolio-aggregate.test.ts`

**Interfaces:**
- Consumes: `resolveStatus`/`StatusRule`, `listClinics`, `listSnapshotsForMonth`, `ensureFrozen`, `getLiveFunnel`, `monthKey`, `CANONICAL_STEPS`.
- Produces:
  - `derivedMetrics(stepCounts: Record<string, number>): { attendance: number; closing: number; noShow: number }` — puro. `attendance = (Compareceram e Não Fecharam + Compareceram e Fecharam) / Agendados`; `closing = Compareceram e Fecharam / (Compareceram e Não Fecharam + Compareceram e Fecharam)`; `noShow = Faltosos / Agendados`. Cada um 0 quando o denominador é 0.
  - `type PortfolioRow = { clinicId; name; city; state; region; mode; source: 'auto'|'manual'|'none'; leads; scheduled; rate; status: string|null; statusColor: string|null; revenue: number; lat: number|null; lng: number|null }`
  - `summarize(rows: PortfolioRow[]): { clinicCount: number; avgRate: number; totalLeads: number; totalScheduled: number; statusDistribution: { label: string; color: string; count: number }[] }` — puro.
  - `getPortfolioForMonth(month: string): Promise<{ rows: PortfolioRow[]; summary: ReturnType<typeof summarize> }>` — server: dispara `ensureFrozen` por clínica; monta as linhas (passado→snapshot; corrente→auto ao vivo / manual snapshot); aplica `resolveStatus`; agrega via `summarize`.
  - `getClinicHistory(clinicId: string, months: number): Promise<{ month: string; rate: number; leads: number; scheduled: number }[]>` — server: série mensal (snapshots + mês corrente) para o gráfico de tendência.

- [ ] **Step 1: Testes de `derivedMetrics` (falhando)**

`tests/portfolio-metrics.test.ts` — casos: funil cheio (agendados=10, faltosos=2, compareceram-não=3, compareceram-sim=4 → attendance=0.7, closing≈0.571, noShow=0.2); denominadores zero → 0.

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- portfolio-metrics` → FAIL.

- [ ] **Step 3: Implementar `metrics.ts`** conforme as fórmulas acima (lê os contadores pelos títulos canônicos).

- [ ] **Step 4: Rodar e ver passar** — `npm test -- portfolio-metrics` → PASS.

- [ ] **Step 5: Testes de `summarize` (falhando)** `tests/portfolio-aggregate.test.ts` — média de taxa ignora clínicas sem dados (`source:'none'`); distribuição de status conta por rótulo; contagem total.

- [ ] **Step 6: Rodar e ver falhar** — `npm test -- portfolio-aggregate` → FAIL.

- [ ] **Step 7: Implementar `aggregate.ts`** (`summarize`).

- [ ] **Step 8: Rodar e ver passar** — `npm test -- portfolio-aggregate` → PASS.

- [ ] **Step 9: Implementar `data.ts`** (`getPortfolioForMonth`, `getClinicHistory`) — server-only, reusa as actions existentes; tolera falha por clínica (auto ao vivo) com `Promise.allSettled`.

- [ ] **Step 10: Build + commit**

Run: `npm run build` && `npm test`
```bash
git add src/lib/portfolio tests/portfolio-metrics.test.ts tests/portfolio-aggregate.test.ts
git commit -m "feat: métricas derivadas + agregação da carteira (data layer)"
```

---

### Task 3: Dashboard da carteira (home)

**Files:**
- Modify: `src/app/(app)/page.tsx` (substitui o placeholder)
- Create: `src/components/dashboard/status-donut.tsx`, `src/components/dashboard/ranking-table.tsx`

**Interfaces:**
- Consumes: `getPortfolioForMonth` (Task 2), `KpiCard`/`Panel` (Task 1), `resolveStatus`.
- Produces: home `/` (server component) com seletor de mês (`?month=YYYY-MM`, default corrente, validado por regex como na Fase 3) e filtro por região; faixa de **KPI cards** (nº de clínicas, taxa média da carteira, total de leads, total de agendados); **donut de distribuição de status**; **tabela-ranking** ordenável por taxa (clínica, leads, agendados, taxa, status colorido) — espelho da planilha. Usar `frontend-design`.

- [ ] **Step 1: `status-donut.tsx` (client, Recharts)** — donut com as fatias coloridas por `statusDistribution` (cor de cada faixa), legenda, total no centro. Tema dark.

- [ ] **Step 2: `ranking-table.tsx`** — recebe `rows: PortfolioRow[]`; tabela dark ordenável (default por taxa desc); status como badge colorido; taxa em %; estado vazio. Linha clicável → `/clinicas/<id>` (detalhe, Task 6).

- [ ] **Step 3: `page.tsx` (home)** — carrega `getPortfolioForMonth(month)`; aplica filtro de região (na server component ou via querystring); monta KPIs + donut + ranking dentro de `<Panel>`s num grid responsivo. Usar `frontend-design` para o layout/estética.

- [ ] **Step 4: Verificar** — `npm run build` && `npm test` (build dinâmico).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/page.tsx src/components/dashboard/status-donut.tsx src/components/dashboard/ranking-table.tsx
git commit -m "feat: dashboard da carteira (KPIs, donut, ranking)"
```

---

### Task 4: Comparativo entre meses

**Files:**
- Create: `src/app/(app)/comparativo/page.tsx`, `src/components/dashboard/trend-chart.tsx`
- Modify: `src/components/app-nav.tsx` (link "Comparativo")

**Interfaces:**
- Consumes: `getClinicHistory` (Task 2) ou uma agregação multi-mês; `listClinics`.
- Produces: rota `/comparativo` — **gráfico de linha** multi-clínica da taxa de conversão ao longo dos meses (Recharts, uma linha por clínica selecionada, com gradiente/brilho) + **tabela mês-a-mês** (clínicas nas linhas, meses nas colunas, % nas células coloridas por status) — espelho da 3ª planilha do usuário. Seleção de quais clínicas exibir. Usar `frontend-design`.

- [ ] **Step 1: `trend-chart.tsx` (client, Recharts)** — `LineChart` dark, eixo X = meses, Y = taxa %, uma série por clínica; tooltip pt-BR; cores distintas/brilho.

- [ ] **Step 2: Data multi-mês** — adicionar em `src/lib/portfolio/data.ts` uma função `getComparison(months: string[]): Promise<{ clinicId; name; byMonth: Record<string, number|null> }[]>` (taxa por clínica por mês, a partir dos snapshots + mês corrente). Sem novo arquivo de teste obrigatório (integração), mas manter pura a transformação se possível.

- [ ] **Step 3: `comparativo/page.tsx`** — monta o gráfico + a tabela mês-a-mês dentro de `<Panel>`. Default: últimos ~6 meses.

- [ ] **Step 4: Link na nav** — "Comparativo" → `/comparativo`.

- [ ] **Step 5: Verificar + commit**

Run: `npm run build` && `npm test`
```bash
git add src/app/\(app\)/comparativo src/components/dashboard/trend-chart.tsx src/components/app-nav.tsx src/lib/portfolio/data.ts
git commit -m "feat: comparativo entre meses (gráfico multi-clínica + tabela)"
```

---

### Task 5: Mapa da carteira

**Files:**
- Create: `src/app/(app)/mapa/page.tsx`, `src/components/map/portfolio-map.tsx`
- Modify: `src/components/app-nav.tsx` (link "Mapa"), `src/app/globals.css` (import do CSS do leaflet)

**Interfaces:**
- Consumes: `getPortfolioForMonth` (Task 2) — usa `lat`/`lng`/`status`/`statusColor`/`region` das linhas.
- Produces: rota `/mapa` — mapa dark (react-leaflet, **dynamic import com `ssr:false`**) centrado no Brasil; cada clínica com coordenadas vira um `CircleMarker` colorido pelo status, com popup (nome, taxa, status); painel lateral "performance por região" (taxa média por região, ordenado). Clínicas sem `lat/lng` listadas à parte ("sem localização"). Usar `frontend-design`.

- [ ] **Step 1: CSS do leaflet** — importar `leaflet/dist/leaflet.css` no `globals.css` (ou no componente). Tiles dark (CARTO dark_matter, sem chave) — documentar a dependência de tiles externos.

- [ ] **Step 2: `portfolio-map.tsx` (client, dynamic, no SSR)** — `MapContainer` com `TileLayer` dark; `CircleMarker` por clínica com `pathOptions.color = statusColor`; popup pt-BR. Leaflet só roda no client → `next/dynamic` com `ssr:false` na página.

- [ ] **Step 3: `mapa/page.tsx`** — carrega `getPortfolioForMonth(month)`; passa as linhas com coordenadas ao mapa; calcula taxa média por região para o painel lateral; estado vazio se ninguém tiver coordenadas.

- [ ] **Step 4: Link na nav** — "Mapa" → `/mapa`.

- [ ] **Step 5: Verificar + commit**

Run: `npm run build` && `npm test`
```bash
git add src/app/\(app\)/mapa src/components/map/portfolio-map.tsx src/components/app-nav.tsx src/app/globals.css
git commit -m "feat: mapa da carteira (pontos por status + performance regional)"
```

---

### Task 6: Detalhe da clínica

**Files:**
- Create: `src/app/(app)/clinicas/[id]/page.tsx`, `src/components/dashboard/funnel-view.tsx`
- Consumes leads (auto): `getLiveFunnel` já traz totais; para a LISTA de leads individuais, adicionar em `integration-actions.ts` uma action `listClinicLeads(clinicId)` (cards do mês corrente: nome/título, etapa, data — derivada de `listCards` + steps), mantendo o gate de auth + service client.

**Interfaces:**
- Consumes: `getClinic` (Fase 1), `getClinicHistory`/`derivedMetrics` (Task 2), `getLiveFunnel` (mês corrente, auto), `trend-chart` (Task 4), snapshots da clínica.
- Produces: rota `/clinicas/[id]` (detalhe) — header com nome/cidade/UF/modo/status; **funil visual das 9 etapas** (auto, mês corrente ao vivo); **gráfico de tendência** mensal da taxa; **métricas derivadas** (comparecimento, fechamento, no-show) e **faturamento** (auto) em KpiCards; para auto, **lista de leads** (nome, etapa atual, data); para manual, link/atalho pra grade `/mensal`. Usar `frontend-design`.

- [ ] **Step 1: `funnel-view.tsx`** — recebe as 9 etapas {title,count}; renderiza um funil visual dark (barras proporcionais com gradiente/brilho, valor por etapa). Sem dados fixos.

- [ ] **Step 2: `listClinicLeads(clinicId)` em `integration-actions.ts`** — `"use server"`, gate de auth, service client p/ ler a integração, `listCards` do mês corrente + `getPanelWithSteps` p/ mapear stepId→título; retorna `{ name, step, date }[]` (sem dados sensíveis além do necessário). Tolera ausência de integração (retorna `{ok:false}`).

- [ ] **Step 3: `clinicas/[id]/page.tsx`** — `params` awaited; `getClinic(id)` (404 se nulo); se auto, `getLiveFunnel` + `listClinicLeads`; `getClinicHistory` p/ a tendência; `derivedMetrics` sobre o funil; monta tudo em `<Panel>`s. Manual: mostra leads/agendados/taxa/tendência e atalho pra `/mensal`. Usar `frontend-design`.

- [ ] **Step 4: Verificar + commit**

Run: `npm run build` && `npm test`
```bash
git add src/app/\(app\)/clinicas/\[id\]/page.tsx src/components/dashboard/funnel-view.tsx src/lib/clinics/integration-actions.ts
git commit -m "feat: detalhe da clínica (funil, tendência, métricas, leads)"
```

---

### Task 7: Configurações (faixas de status + etapas do funil)

**Files:**
- Create: `src/app/(app)/configuracoes/page.tsx`, `src/lib/snapshots/rules-actions.ts`
- Modify: `src/components/app-nav.tsx` (link "Configurações")

**Interfaces:**
- Consumes: `status_rules` e `funnel_steps` (Supabase, client autenticado).
- Produces: rota `/configuracoes` — editor das **faixas de status** (rótulo, taxa mín/máx, cor) com salvar/adicionar/remover via server actions (`listStatusRules`, `upsertStatusRule`, `deleteStatusRule`); visualização (somente leitura) das **9 etapas do funil**. Usar `frontend-design`.

- [ ] **Step 1: `rules-actions.ts`** — `"use server"`: `listStatusRules()`, `upsertStatusRule(rule)`, `deleteStatusRule(id)` (client autenticado; `status_rules` é dado comum sob RLS). Validar `rate_min < rate_max` e cor hex.

- [ ] **Step 2: `configuracoes/page.tsx`** — tabela editável das faixas (inputs de taxa/cor) + lista das etapas do funil (leitura). Dark + pt-BR. Usar `frontend-design`.

- [ ] **Step 3: Link na nav** — "Configurações" → `/configuracoes`.

- [ ] **Step 4: Verificar + commit**

Run: `npm run build` && `npm test`
```bash
git add src/app/\(app\)/configuracoes src/lib/snapshots/rules-actions.ts src/components/app-nav.tsx
git commit -m "feat: configurações (faixas de status + etapas do funil)"
```

---

## Self-Review (cobertura — Fase 4)

- **Dashboard da carteira (KPIs, distribuição de status, ranking, filtros mês/região)**: Tasks 2, 3. ✅
- **Comparativo entre meses (gráfico multi-clínica + tabela mês-a-mês)**: Task 4. ✅
- **Mapa da carteira (pontos por status + performance regional)**: Task 5. ✅
- **Detalhe da clínica (funil visual, tendência, métricas derivadas, faturamento, lista de leads)**: Tasks 2, 6. ✅
- **Configurações (faixas de status editáveis + etapas do funil)**: Task 7. ✅
- **Estética dark sofisticada (referências do usuário)**: constraint global + uso de `frontend-design` em todas as tasks de UI. ✅
- **Reaproveitamento das Fases 1–3 (sem novas tabelas)**: camada `portfolio` consome snapshots/Helena/clínicas. ✅

Notas de dependências externas (documentar no README/handoff): tiles do mapa (CARTO dark, gratuito sem chave) e geocodificação (já na Fase 1). Pendências herdadas a revisitar aqui: ler `step_counts` dos snapshots congelados (para o funil de meses passados no detalhe) e a faixa de status aberta no topo (taxas ≥ limite superior).
