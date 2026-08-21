-- Parte 1 de 2 da issue #71: cria os schemas `aniversariantes` e `dashboards`,
-- vazios, com os grants que o service_role precisa. NÃO move tabela nenhuma —
-- o move é a 0083, e só pode rodar depois que os três apps estiverem em
-- produção lendo a env var de schema.
--
-- POR QUE ESTÁ DIVIDIDA EM DUAS. O DDL original da issue era um script único.
-- Separar existe porque as duas metades têm pré-requisitos diferentes:
--   - Esta metade é inócua e pode rodar AGORA. Schema vazio não muda o
--     comportamento de ninguém, e ele precisa existir antes de ser adicionado
--     em Settings → API → Exposed schemas (passo de painel, sem API).
--   - A 0083 é o corte. Se rodar antes dos deploys, os três apps passam a
--     procurar as tabelas em `public`, onde elas não estão mais.
-- Juntas num arquivo, a única forma de fazer o passo do painel entre as duas
-- metades seria editar a migration no meio da operação.
--
-- POR QUE ESTE DDL VIVE NO CLINIC CONTROL, e não é violação do ADR 0006.
-- Ele move tabelas de dois donos diferentes (repo Aniversariantes e repo
-- DashBoard-s), então não pertence a nenhum dos dois. Está aqui porque este é
-- o único dos três repos com pipeline de migration que funciona. Depois deste
-- move, o DDL corrente de cada schema VOLTA para o repo dono: `aniversariantes`
-- para o repo Aniversariantes, `dashboards` para o DashBoard-s quando ele tiver
-- migrations de verdade. Este arquivo é um move pontual, não um precedente de
-- que o Clinic Control versiona schema alheio.
--
-- Sem `set search_path` de propósito: tudo aqui é qualificado por schema.

create schema if not exists aniversariantes;
create schema if not exists dashboards;

-- `usage` no schema é o grant que não viaja com o `set schema` da 0083 — o ACL
-- da tabela viaja, o do schema não existia. Sem isso, o PostgREST autentica e
-- ainda assim não alcança as tabelas.
grant usage on schema aniversariantes to service_role;
grant usage on schema dashboards      to service_role;

-- `anon` e `authenticated` ficam DE FORA de propósito. As 8 tabelas têm RLS
-- ligada com zero policies (deny-all) e todo acesso é service role nos três
-- apps. Conceder usage aqui recriaria em schema novo a exposição que a 0079
-- fechou no `clinic_control`.

-- Default privileges: vale só para objetos criados pelo MESMO role que executa
-- este comando. As migrations dos três repos rodam como `postgres`, então cobre
-- o caso real (tabela nova criada por migration futura já nasce com grant).
-- Não cobriria uma tabela criada à mão por outro role no SQL Editor.
alter default privileges in schema aniversariantes grant all on tables    to service_role;
alter default privileges in schema aniversariantes grant all on sequences to service_role;
alter default privileges in schema dashboards      grant all on tables    to service_role;
alter default privileges in schema dashboards      grant all on sequences to service_role;
