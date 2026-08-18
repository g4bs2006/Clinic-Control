# Fase 1 — Fundação + CRUD de Clínicas

> Documentação completa do que foi construído na Fase 1 do sistema de gestão da
> carteira de clínicas (Clinic-Control). Esta fase entrega a base do app e o
> cadastro completo de clínicas. As integrações e dashboards vêm nas fases seguintes.

- **Repositório:** `g4bs2006/Clinic-Control` · branch `fase-1-fundacao-crud`
- **Local:** `C:\Users\T-GAMER\Desktop\Contact\gestao-clinicas`
- **Data de conclusão:** 2026-06-26
- **Spec de design:** [docs/superpowers/specs/2026-06-26-gestao-clinicas-design.md](superpowers/specs/2026-06-26-gestao-clinicas-design.md)
- **Plano de implementação:** [docs/superpowers/plans/2026-06-26-fase1-fundacao-crud-clinicas.md](superpowers/plans/2026-06-26-fase1-fundacao-crud-clinicas.md)

---

## 1. Visão geral

A Fase 1 entrega um aplicativo Next.js standalone, com tema escuro e em português,
autenticação interna via Supabase e o **CRUD completo de clínicas** (criar, listar,
editar, arquivar) com geocodificação de endereço e derivação automática de região.

O que **já funciona** (após o setup do Supabase descrito na seção 8):

- Login interno (Supabase Auth) e proteção de rotas.
- Cadastro de clínica com dados básicos, endereço e seletor de **modo** (manual/automático).
- Geocodificação do endereço (lat/lng) e cálculo da região brasileira a partir da UF.
- Listagem da carteira em tabela, com edição e arquivamento.
- Banco preparado com o funil padrão de 9 etapas e as faixas de status (seeds), além de RLS.

O que **ainda não** está nesta fase (vem depois): integração com a API Helena,
preenchimento/cálculo dos snapshots mensais, motor de status aplicado, dashboards,
gráficos, mapa e nível de lead.

## 2. Stack e decisões

| Tema | Decisão |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Estilo | Tailwind CSS v4, **tema escuro prioritário** (navy/teal), interface pt-BR |
| Componentes | shadcn/ui (variante base-ui/react — `Button` usa prop `render`, não `asChild`) |
| Banco | Supabase (Postgres) |
| Auth | Supabase Auth (e-mail/senha), apenas equipe interna |
| Geocodificação | Nominatim (OpenStreetMap), sem chave de API |
| Testes | Vitest (lógica pura, em TDD) |
| Deploy alvo | Vercel |

Princípio de sincronização (para as fases automáticas): leitura sob demanda do mês
corrente + fechamento mensal — escolhido como "opção A" no brainstorm.

## 3. Estrutura de arquivos

```
gestao-clinicas/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # layout raiz: dark forçado, lang pt-BR, <Toaster/>
│   │   ├── globals.css             # tokens de cor dark (navy/teal) p/ Tailwind v4
│   │   ├── login/page.tsx          # tela de login (server component)
│   │   └── (app)/                  # grupo autenticado
│   │       ├── layout.tsx          # nav lateral + conteúdo
│   │       ├── page.tsx            # placeholder do Início (dashboard = Fase 4)
│   │       └── clinicas/
│   │           ├── page.tsx        # listagem da carteira
│   │           ├── nova/page.tsx   # criar clínica
│   │           └── [id]/editar/page.tsx  # editar clínica
│   ├── components/
│   │   ├── app-nav.tsx             # navegação lateral (client, rota ativa)
│   │   ├── clinics/
│   │   │   ├── clinic-table.tsx    # tabela da carteira + ação arquivar
│   │   │   └── clinic-form.tsx     # formulário criar/editar (client)
│   │   └── ui/                     # componentes shadcn
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # client de browser (anon key)
│   │   │   ├── server.ts           # client de servidor (cookies)
│   │   │   └── middleware.ts       # refresh de sessão + proteção de rotas
│   │   ├── auth/actions.ts         # signIn / signOut (server actions)
│   │   ├── clinics/
│   │   │   ├── schema.ts           # Zod (clinicInputSchema) + tipos Clinic/ClinicInput
│   │   │   ├── region.ts           # regionFromState(uf)
│   │   │   └── actions.ts          # CRUD: list/get/create/update/archive
│   │   └── geocoding/nominatim.ts  # geocodeAddress(query, fetch?)
│   └── middleware.ts               # entrypoint do middleware (matcher)
├── supabase/migrations/
│   ├── 0001_init.sql               # enums, tabelas, seeds, trigger updated_at
│   └── 0002_rls.sql                # Row Level Security
├── tests/                          # smoke, region, clinic-schema, nominatim
├── .env.example                    # template de variáveis (versionado)
└── docs/                           # spec, plano e esta documentação
```

## 4. Modelo de dados (migração `0001_init.sql`)

**Enums:** `clinic_mode` (`auto` | `manual`), `contract_status` (`active` | `suspended` | `archived`).

**`clinics`** — cadastro: `id`, `name`, `address`, `city`, `state` (UF), `region`
(derivada), `lat`, `lng`, `mode`, `contract_status`, `created_at`, `updated_at`
(atualizado por trigger). Sem campo de mensalidade (decisão do usuário).

**`funnel_steps`** (seed) — as 9 etapas padrão do funil, em ordem fixa, com flags
`counts_as_scheduling` (Agendados, Reagendados) e `counts_as_closing` (Compareceram e
Fecharam). Usado pelas fases automáticas.

**`status_rules`** (seed) — 5 faixas configuráveis de status por taxa de conversão
(fração 0..1): Risco Churn (0–5%), Preocupante (5–9%), Ok/Atenção (9–11%), Bom
(11–13%), Ótimo (13%+), cada uma com cor.

Tabelas das próximas fases (integrações, snapshots mensais, leads) **não** são criadas
nesta fase.

## 5. Segurança — Row Level Security (`0002_rls.sql`)

O Supabase expõe as tabelas via PostgREST usando a **chave anon** (pública, vai para o
browser em `NEXT_PUBLIC_`). Sem RLS, os dados ficariam abertos. Por isso a migração
`0002_rls.sql`:

- Habilita RLS em `clinics`, `funnel_steps` e `status_rules`.
- `revoke all ... from anon` (defesa em profundidade).
- Cria policies `for all to authenticated using (true) with check (true)` — como o
  sistema é interno, todo usuário logado é da equipe e tem acesso total; o papel anônimo
  é negado por padrão.

> Esta correção foi adicionada após o review automático de segurança apontar a ausência
> de RLS. As tabelas das próximas fases devem seguir o mesmo padrão.

## 6. Autenticação e proteção de rotas

- `src/lib/auth/actions.ts`: `signIn(formData)` chama `signInWithPassword` e redireciona
  para `/` (sucesso) ou `/login?error=1` (falha); `signOut()` encerra a sessão e volta
  para `/login`.
- `src/app/login/page.tsx`: formulário dark em pt-BR; mostra erro quando `?error=1`.
- `src/lib/supabase/middleware.ts` (`updateSession`): faz o refresh de sessão do
  `@supabase/ssr` e **redireciona usuários não autenticados para `/login`** (exceto na
  própria `/login`), preservando os cookies de sessão no redirect e sem criar loop.

> A afordância de logout no menu ainda não foi conectada (a action `signOut` existe);
> fica para uma fase posterior.

## 7. Lógica de domínio e CRUD

- **`region.ts`** — `regionFromState(uf)` mapeia as 27 UFs para as 5 regiões; entrada
  inválida → "Desconhecida"; case-insensitive. (6 testes)
- **`schema.ts`** — `clinicInputSchema` (Zod): `name` mín. 2; `address`/`city` opcionais;
  `state` opcional de 2 letras; `mode` default `manual`; `contract_status` default
  `active`. Exporta os tipos `ClinicInput` e `Clinic`. (4 testes)
- **`nominatim.ts`** — `geocodeAddress(query, fetch?)` consulta o Nominatim, devolve
  `{lat, lng}` ou `null` (consulta vazia / sem resultado / erro HTTP). `fetch` injetável
  para teste. (3 testes)
- **`clinics/actions.ts`** (server actions):
  - `listClinics()` — exclui arquivadas, ordena por nome; **lança** erro em falha de DB.
  - `getClinic(id)` — retorna `Clinic | null` (PGRST116 = não encontrado → `null`);
    outros erros lançam.
  - `createClinic(input)` / `updateClinic(id, input)` — validam com Zod, derivam região,
    geocodificam o endereço e chamam `revalidatePath("/clinicas")`.
  - `archiveClinic(id)` — marca `contract_status = 'archived'`.
  - Resultados de mutação: `{ ok: true, ... }` ou `{ ok: false, error }`.

**Telas:** listagem (`/clinicas`) com tabela (nome, cidade/UF, região, modo, status,
ações editar/arquivar) e estado vazio amigável; formulário (`/clinicas/nova` e
`/clinicas/[id]/editar`) com os campos básicos, Switch de modo e Select de status —
quando o modo é **automático**, exibe um aviso "Configuração da integração Helena chega
na Fase 2" (sem campo de token ainda). Erros aparecem via toast (sonner).

## 8. Como configurar e rodar

Pré-requisitos: Node.js e uma conta Supabase.

1. **Instalar dependências:** `npm install`
2. **Criar projeto Supabase** e copiar, para um arquivo `.env.local` (use `.env.example`
   como base):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. **Aplicar as migrações** `supabase/migrations/0001_init.sql` e `0002_rls.sql`
   (pelo SQL Editor do painel ou `supabase db push`).
4. **Criar um usuário interno** em Auth → Users (no painel Supabase).
5. **Rodar:** `npm run dev` → abrir `http://localhost:3000` → login → `/clinicas`.

Scripts: `npm run dev` (desenvolvimento), `npm run build` (build), `npm test` (testes).

## 9. Testes

Suíte Vitest cobrindo a lógica pura em TDD: `region` (6), `clinic-schema` (4),
`nominatim` (3) e um smoke (1) — **14 testes**. As server actions e telas dependem do
Supabase e foram verificadas por type-check/build (`npm run build`); os testes de
integração contra o banco entram quando houver um Supabase de teste.

## 10. Itens conhecidos e adiados

Levantados nas revisões e deliberadamente adiados (não bloqueiam a Fase 1):

- Remover `CLAUDE.md`/`AGENTS.md`/`README.md` gerados pelo scaffold (limpeza cosmética).
- `globals.css` tem uma paleta de modo claro não usada (o app força dark) — útil só se
  um dia houver alternância de tema.
- `<Toaster>` segue o tema do SO (não há `next-themes` provider); definir `theme="dark"`
  quando conveniente.
- Conectar a action `signOut` a um botão de logout no menu.
- Reforço opcional (defense-in-depth): checar `getUser()` dentro das server actions,
  além da proteção por middleware + RLS.

## 11. Próximas fases

- **Fase 2 — Integração Helena + onboarding:** camada `lib/helena/`, listar painéis no
  cadastro da clínica automática, salvar token (cifrado) + painel, teste de conexão e
  leitura do funil ao vivo.
- **Fase 3 — Snapshots, motor de status e entrada manual:** histórico mensal, fechamento
  do mês, aplicação das faixas de status, formulário manual de métricas.
- **Fase 4 — Dashboards, gráficos, mapa e nível de lead:** home/ranking, comparativo
  entre meses, mapa da carteira por região e detalhe da clínica com funil e leads.
