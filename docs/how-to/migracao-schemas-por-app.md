# Migração: um schema dedicado por app

Runbook da [issue #71](https://github.com/g4bs2006/Clinic-Control/issues/71) —
tirar as tabelas do Aniversariantes e do DashBoard-s do schema `public` e dar a
cada app um schema próprio. Paga a dívida que o
[ADR 0001](../adr/0001-banco-unico-compartilhado.md) registrou como custo aceito.

Projeto Supabase: `jggfnfxdtfqeqyvxufgu`.

| Schema | Tabelas | Dono a partir do corte |
|---|---|---|
| `clinic_control` | 58 | Clinic Control (`0084+`, convenção `00NN_`) |
| `aniversariantes` | 4 | repo Aniversariantes (convenção `AAAAMMDD_`) |
| `dashboards` | 4 | repo DashBoard-s (hoje sem migrations — ver dívida no fim) |
| `public` | 1 (`automacao_clinicas`) | Clinic Control |

## Por que a ordem importa mais que o DDL

O DDL é trivial: `set schema` é operação só de catálogo, milissegundos. O que
pode dar errado é **sequência**, não SQL.

Os três apps procuram as tabelas no schema que a env var manda. Enquanto a env
var não existe, o default é `public`. Então:

- **Mover as tabelas antes dos apps estarem em produção** com o código que lê a
  env var → os três procuram em `public`, onde não está mais. Quebra tudo.
- **Definir a env var antes de mover** → procuram no schema novo, ainda vazio.
  Quebra tudo.
- **Mover sem expor o schema no PostgREST** → `PGRST106` em toda chamada. É o
  passo mais fácil de esquecer, porque é o único que não está em repo nenhum.

A janela segura é: código em produção com default `public` → move → flipa a env
var. Rollback em qualquer ponto = tirar a env var e/ou mover de volta.

Não há saída por view de compatibilidade em `public`: o `cardsIngest.js` do
DashBoard-s faz upsert com `on_conflict=account_id,card_id`, e o PostgREST não
faz upsert em view (não há alvo de `ON CONFLICT`). A transição é por
configuração, não por shim no banco.

## Passos

### Feito

- [x] **DDL da `public.clinics` versionado.** Não existia em repo nenhum — só no
      banco. Reconstruído por introspecção em `DashBoard-s/supabase/clinics.sql`.
      Sem isso, `dashboards.clinics` nasceria tão não-reconstruível quanto era.
- [x] **Schema configurável nos três repos**, todos com default `public` e zero
      mudança de comportamento. Mergeados em 2026-08-21:

      | Repo | PR | Env var |
      |---|---|---|
      | Clinic Control | g4bs2006/Clinic-Control#72 | `ANIVERSARIANTES_DB_SCHEMA` |
      | Aniversariantes | g4bs2006/Aniversariantes#2 | `ANIVERSARIANTES_DB_SCHEMA` |
      | DashBoard-s | contactIA/DashBoard-s#7 | `DASHBOARDS_DB_SCHEMA` |

      No DashBoard-s foram 28 call sites roteados por um helper único
      (`src/server/supabase.js`), porque as chamadas são REST cruas e cada uma
      precisa de `Accept-Profile`/`Content-Profile` fora do schema default. Um
      call site esquecido não daria erro de build — daria 404 só naquele caminho.
      Conferido: os 5 scripts que a PR não tocou apontam para `api.wts.chat`
      (Helena), não para o Supabase.
- [x] **Pré-voo no banco** (2026-08-21). Ver o cabeçalho da `0083` para o
      resultado completo. Resumo: as 8 tabelas estão isoladas — 4 FKs internas
      ao grupo Aniversariantes, zero triggers, zero funções, zero views.

### A fazer

Os passos 3, 4, 6 e 8 **só podem ser feitos à mão** — dependem de painel, de
GitHub Actions e de deploy, não de repo.

1. [ ] **Aplicar a `0082`** (cria os schemas vazios + grants). Inócua, pode ser
       aplicada a qualquer momento. Não move nada.
2. [ ] **Deployar os três apps em produção**, ainda sem a env var definida.
       Clinic Control na VPS Hostinger; Aniversariantes e DashBoard-s na Vercel.
       Nada muda de comportamento — é o passo que abre a janela segura.
3. [ ] **Expor os schemas no PostgREST.** Painel → Settings → API → *Exposed
       schemas* → adicionar `aniversariantes` e `dashboards`. **Não há API nem
       MCP para isso.** Pode ser feito com os schemas ainda vazios.
4. [ ] **Pausar os crons.** Chamada em voo durante o move falha. São **três**,
       em dois lugares diferentes:
       - DashBoard-s, GitHub Actions: `sync-clinicorp.yml` e `ingest-cards.yml`.
         Rodam a cada ~30 min, então a janela é curta e vale desligar só na hora.
       - **Aniversariantes, Vercel Cron** (`vercel.json`, `0 6 * * *`) —
         `/api/cron/sync-clinicorp`. Estava faltando nesta lista, e a razão de
         ninguém ter notado é que ele **está morto desde 12/08/2026**:
         `CRON_SECRET` nunca foi cadastrada na Vercel, e a rota rejeita toda
         chamada sem ela. Se você religar (é só cadastrar a variável), ele volta
         a ser risco aqui. Rodando 1x/dia às 6h UTC, a saída mais simples é
         fazer o corte fora dessa hora em vez de pausar.
5. [ ] **Aplicar a `0083`** — o corte. Move as 8 tabelas e dropa as duas funções
       mortas. Precisa ser atômica (ver o cabeçalho do arquivo).
6. [ ] **Conferir as contagens.** Query e linha de base no fim da `0083`.
7. [ ] **Definir as env vars em produção e redeployar os três:**
       `ANIVERSARIANTES_DB_SCHEMA=aniversariantes` (Clinic Control e
       Aniversariantes) e `DASHBOARDS_DB_SCHEMA=dashboards` (DashBoard-s).
8. [ ] **Religar os crons**, rodar um ciclo de cada e conferir o upsert de
       `cards` — é o caminho que nenhum shim cobriria.
9. [ ] **Verificação funcional:** dashboard de uma clínica real abrindo por
       `?clinic=slug`, e o painel do Aniversariantes na aba Cadastro carregando.
10. [ ] **Conferir `_syncLock` preso** em `dashboards.clinics.steps`, caso algum
        processo tenha morrido no meio.

### Depois do corte

- [ ] `docs/reference/schema-aniversariantes.md` atualizado com os nomes novos.
- [ ] ADR 0001 emendado — a justificativa do "`public` compartilhado" muda.
- [ ] Comentário de `src/lib/supabase/config.ts` (menciona a colisão de
      `clinics`, que deixa de existir).
- [ ] Aniversariantes: tipos regerados para o schema novo e o cast `as 'public'`
      de `src/lib/supabase.ts` removido; o `SCHEMA` volta a ser constante.
- [ ] Clinic Control: `SCHEMA` em `aniversariantes-service.ts` volta a ser
      constante, com o valor novo.
- [ ] `supabase/dump/migration-notes.md` revisado.
- [ ] `graphify update .`

## Rollback

O rollback é barato em qualquer ponto, e é por isso que a migração foi desenhada
em duas metades.

**Antes da `0083`:** nada a desfazer. Schema vazio não afeta ninguém. Se quiser
limpar: `drop schema aniversariantes, dashboards;` (sem `cascade`, que falharia
se houvesse objeto — é o comportamento desejado).

**Depois da `0083`, antes de flipar as env vars:** o sintoma é os três apps
falhando, porque procuram em `public`. Duas saídas, e a segunda é preferível:

1. Mover de volta (abaixo).
2. **Ir para frente** — definir as env vars e redeployar. Se a `0083` passou e as
   contagens bateram, o estado alvo está correto e o que falta é só configuração.

**Depois de flipar as env vars:** tirar a env var **não basta** — o app volta a
procurar em `public`, que está vazio. Ou reverte só o código (tirar env var +
redeploy) *e* move as tabelas de volta, ou não reverte nada. As duas metades
andam juntas.

### Mover de volta

```sql
begin;

alter table aniversariantes.aniversariantes_clinicas        set schema public;
alter table aniversariantes.aniversariantes_templates       set schema public;
alter table aniversariantes.aniversariantes_envios          set schema public;
alter table aniversariantes.aniversariantes_pacientes_cache set schema public;

alter table dashboards.clinics    set schema public;
alter table dashboards.cards      set schema public;
alter table dashboards.sync_log   set schema public;
alter table dashboards.ingest_log set schema public;

commit;
```

Depois: tirar `ANIVERSARIANTES_DB_SCHEMA` e `DASHBOARDS_DB_SCHEMA` de produção e
redeployar os três. Não é preciso mexer em *Exposed schemas* — um schema exposto
e vazio é inofensivo.

### Recriar as funções dropadas

Só se algo inesperado depender delas. **Elas já estavam quebradas antes do
corte:** as duas delegam para o schema `automacao`, que não existe neste banco,
então falhavam em qualquer chamada. Recriar restaura o estado anterior, não um
estado funcional.

```sql
create or replace function public.get_config_clinica(p_company_id uuid)
  returns json language sql security definer
  set search_path to 'public', 'automacao'
as $fn$ select automacao.get_config_clinica(p_company_id); $fn$;

create or replace function public.upsert_config_clinica(p_payload json)
  returns uuid language sql security definer
  set search_path to 'public', 'automacao'
as $fn$ select automacao.upsert_config_clinica(p_payload); $fn$;
```

Vale entender **por que** existiam antes de repetir o caminho: são resíduo de uma
tentativa anterior desta mesma separação, que não foi concluída. Procurar no
histórico do n8n ou em conversas antigas antes de assumir que foi só abandono.

## O que esta migração não resolve

- **`automacao_clinicas` fica em `public`, de propósito.** O consumidor são os
  workflows do n8n, fora de qualquer repo: não há como inventariar quantos leem a
  tabela nem testá-los antes, e uma quebra só apareceria quando um agendamento
  falhasse. Fronteira documentada em vez de movida. O único ponto do Clinic
  Control que continua escrevendo em `public` é
  `src/lib/clinics/automation-projection.ts`.
- **O DashBoard-s não tem migrations de verdade** — só `.sql` soltos rodados à
  mão no SQL Editor. Enquanto for assim, `dashboards` tem dono nominal, não real.
  Follow-up, não bloqueio.
- **A assimetria de cifra continua.** As credenciais que o Clinic Control cifra
  atravessam para o schema vizinho em texto plano. Mudar de schema não muda isso
  — ver g4bs2006/Clinic-Control#28 e
  `docs/reference/schema-aniversariantes.md` § "Credenciais em texto plano".
- **O contrato entre repos continua sendo documento, não código.** A solução
  definitiva é o monorepo com um `packages/db` único, onde o compilador verifica.
  Ver [ADR 0006](../adr/0006-dono-unico-das-migrations.md).
