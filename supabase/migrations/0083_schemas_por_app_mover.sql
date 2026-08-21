-- Parte 2 de 2 da issue #71: o corte. Move as 8 tabelas de `public` para os
-- schemas criados na 0082 e dropa duas funções mortas.
--
-- ####################################################################
-- ## NÃO APLICAR ANTES DE TODOS OS PRÉ-REQUISITOS ABAIXO.           ##
-- ## Aplicar fora de ordem derruba os três apps ao mesmo tempo.     ##
-- ####################################################################
--
-- PRÉ-REQUISITOS, na ordem:
--   1. 0082 aplicada (schemas existem).
--   2. Os três apps EM PRODUÇÃO com o código que lê a env var de schema:
--        Clinic Control  #72  ANIVERSARIANTES_DB_SCHEMA   (VPS Hostinger)
--        Aniversariantes  #2  ANIVERSARIANTES_DB_SCHEMA   (Vercel)
--        DashBoard-s      #7  DASHBOARDS_DB_SCHEMA        (Vercel)
--      Todos ainda com o default `public` — sem a env var definida.
--   3. Settings → API → Exposed schemas: `aniversariantes` e `dashboards`
--      adicionados. É passo de PAINEL, não tem API nem MCP. Esquecer este é o
--      jeito mais fácil de quebrar 100% das chamadas com PGRST106.
--   4. Crons pausados. São TRÊS, em dois lugares:
--      - DashBoard-s (GitHub Actions): sync-clinicorp.yml, ingest-cards.yml.
--        Rodam a cada ~30 min.
--      - Aniversariantes (Vercel Cron, vercel.json, 0 6 * * *):
--        /api/cron/sync-clinicorp. Hoje está MORTO (CRON_SECRET não cadastrada
--        na Vercel desde 12/08/2026), mas volta a ser risco assim que religado.
--        Rodando 1x/dia às 6h UTC, mais simples é cortar fora dessa hora.
--      Chamada em voo durante o move falha.
--
-- DEPOIS de aplicar, na ordem: conferir contagens (abaixo) → definir as env
-- vars em produção e redeployar os três → religar os crons → rodar um ciclo de
-- sync-clinicorp e de ingest-cards → conferir o upsert de `cards`.
--
-- CUSTO DA OPERAÇÃO: `set schema` é só catálogo. Não reescreve dado, não
-- reindexa. Milissegundos até nos 64 MB de `cards`. Pega ACCESS EXCLUSIVE por
-- um instante em cada tabela — daí pausar os crons antes.
--
-- ATOMICIDADE: precisa ser aplicada como transação única. O CLI do Supabase e
-- o apply_migration envolvem a migration numa transação; se for rodada à mão
-- no SQL Editor, envolver em begin/commit à mão. Metade movida é o pior
-- estado possível.
--
-- PRÉ-VOO CONFERIDO NO BANCO REAL (2026-08-21, projeto jggfnfxdtfqeqyvxufgu).
-- As 8 tabelas estão completamente isoladas — o move é seguro porque não há
-- nada apontando para elas de fora:
--   - FKs: 4, todas INTERNAS ao grupo Aniversariantes (templates/envios/
--     pacientes_cache → clinicas). Viajam junto no set schema, sem ajuste.
--     O grupo Dashboards não tem FK nenhuma.
--   - Triggers nas 8 tabelas: ZERO. O único trigger em `public` é
--     trg_automacao_clinicas_updated_at, em `automacao_clinicas`, que FICA.
--   - Funções que referenciam as 8 tabelas, em qualquer schema: ZERO.
--     (Confere o risco 6 da issue — nenhuma função de `clinic_control` as toca,
--     apesar do `set search_path to clinic_control, public` da 0070.)
--   - Views/matviews que dependem delas: ZERO. As 3 views do projeto são todas
--     de `clinic_control` e não as mencionam.
--   - `clinic_control.clinics` é tabela DIFERENTE de `public.clinics`. As 27
--     FKs para "clinics" são todas internas ao `clinic_control`. É a colisão de
--     nome que o ADR 0001 registrou — e que deixa de existir depois desta
--     migration, porque a homônima sai de `public`.
--
-- RLS: continua ligada com zero policies nas 8 tabelas. O ACL de cada tabela
-- viaja com ela no set schema, então os grants de service_role são preservados.
-- O que não viajava era o `usage` no schema — concedido na 0082.

-- Grupo Aniversariantes → schema `aniversariantes`
-- Dono a partir daqui: repo Aniversariantes (convenção AAAAMMDD_).
alter table public.aniversariantes_clinicas        set schema aniversariantes;
alter table public.aniversariantes_templates       set schema aniversariantes;
alter table public.aniversariantes_envios          set schema aniversariantes;
alter table public.aniversariantes_pacientes_cache set schema aniversariantes;

-- Grupo Dashboards → schema `dashboards`
-- `sync_log.id` e `ingest_log.id` são IDENTITY. A sequence tem dependência
-- interna à coluna e acompanha o set schema automaticamente — nenhum passo
-- manual de sequence, e nenhum risco de sequence apontando para o schema velho.
alter table public.clinics    set schema dashboards;
alter table public.cards      set schema dashboards;
alter table public.sync_log   set schema dashboards;
alter table public.ingest_log set schema dashboards;

-- Redundante por segurança: o ACL da tabela viaja com ela, então estes grants
-- já deveriam estar de pé. Custa nada e cobre o caso de uma tabela que tivesse
-- perdido o grant antes do move.
grant all on all tables    in schema aniversariantes to service_role;
grant all on all sequences in schema aniversariantes to service_role;
grant all on all tables    in schema dashboards      to service_role;
grant all on all sequences in schema dashboards      to service_role;

-- Código morto. As duas são wrappers SECURITY DEFINER que fazem
-- `select automacao.<mesmo_nome>(...)`, com `search_path to public, automacao`.
-- O schema `automacao` NÃO EXISTE neste banco — as duas falham se chamadas.
-- São resíduo de uma tentativa anterior desta mesma separação, que não foi
-- concluída. As definições exatas estão no procedimento de rollback
-- (docs/how-to/migracao-schemas-por-app.md) caso precise recriar.
drop function if exists public.get_config_clinica(uuid);
drop function if exists public.upsert_config_clinica(json);

-- `public` fica com: automacao_clinicas + set_updated_at_automacao().
-- Fica de propósito: o consumidor são os workflows do n8n, fora de qualquer
-- repo, sem como inventariar nem testar antes. Fronteira documentada em vez de
-- movida. Ver src/lib/clinics/automation-projection.ts, o único ponto do
-- Clinic Control que continua escrevendo em `public`.

-- CONFERIR DEPOIS DE APLICAR (linha de base medida em 2026-08-21, pré-move):
--   select 'aniversariantes_clinicas', count(*) from aniversariantes.aniversariantes_clinicas         --     2
--   union all select 'aniversariantes_templates', count(*) from aniversariantes.aniversariantes_templates       --     3
--   union all select 'aniversariantes_envios', count(*) from aniversariantes.aniversariantes_envios             --    80
--   union all select 'aniversariantes_pacientes_cache', count(*) from aniversariantes.aniversariantes_pacientes_cache --    88
--   union all select 'clinics', count(*) from dashboards.clinics                                     --    38
--   union all select 'cards', count(*) from dashboards.cards                                         -- 26998
--   union all select 'sync_log', count(*) from dashboards.sync_log                                   --  1589
--   union all select 'ingest_log', count(*) from dashboards.ingest_log                               -- 13140
--   union all select 'automacao_clinicas', count(*) from public.automacao_clinicas;                  --    41
-- As contagens de sync_log/ingest_log/cards CRESCEM com os crons; o que importa
-- é não DIMINUIR. clinics e as 4 de aniversariantes devem bater exato.
