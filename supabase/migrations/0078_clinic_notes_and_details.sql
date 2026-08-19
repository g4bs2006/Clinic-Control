-- Anotações e detalhes livres da clínica — a memória de contexto que hoje vive
-- em conversa solta: "o dono só responde depois das 18h", "a recepção nova ainda
-- não sabe usar o funil". Duas tabelas porque são duas naturezas diferentes:
--
--   clinic_notes    → texto corrido, cronológico, com autor (o que aconteceu)
--   clinic_details  → chave/valor estável, sem autor (o que a clínica É)
--
-- Não confundir com clinic_file_notes (0060): aquela é indexada por CAMINHO de
-- arquivo/pasta do Storage; esta é da clínica como um todo.
set search_path to clinic_control, public;

-- ── Anotações ────────────────────────────────────────────────────────────────
-- `is_private` é por anotação, não por usuário: a mesma pessoa escreve recado
-- para o time e rascunho só dela. A privacidade é regra de SERVIDOR (RLS está
-- desligada — src/lib/supabase/server.ts usa service role), garantida pelo
-- filtro de autor em toda leitura; o banco só guarda a intenção.
--
-- `pinned_at` segue o mesmo eixo de tasks.pinned_at (0073): fixar é "é NISSO
-- que estou olhando agora", independente de data.
create table if not exists clinic_notes (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  body       text not null,
  author_id  uuid references app_users(id) on delete set null,
  is_private boolean not null default false,
  pinned_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice na ordem exata de leitura da tela: fixadas primeiro, recentes antes.
create index if not exists clinic_notes_clinic_idx
  on clinic_notes (clinic_id, pinned_at desc nulls last, created_at desc);

-- Toda leitura de privada filtra por author_id — vale um índice próprio.
create index if not exists clinic_notes_author_idx
  on clinic_notes (author_id) where is_private;

-- deleteUser (src/lib/users/actions.ts) apaga o usuário de verdade, e o FK acima
-- é `set null`. Uma anotação PRIVADA com author_id null nunca mais satisfaz
-- `author_id = <sessão>`: fica invisível para todos e imortal — lixo que só
-- cresce. Compartilhada é diferente: o conteúdo era do time, sobrevive sem dono
-- (a tela mostra "autor removido"). Então a privada morre com o autor.
create or replace function clinic_notes_drop_private_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = clinic_control, public
as $$
begin
  delete from clinic_notes where author_id = old.id and is_private;
  return old;
end;
$$;

drop trigger if exists clinic_notes_drop_private on app_users;
create trigger clinic_notes_drop_private
  before delete on app_users
  for each row execute function clinic_notes_drop_private_on_user_delete();

-- ── Detalhes (campos livres chave/valor) ─────────────────────────────────────
-- Extensão da "Ficha da clínica" para o que não merece coluna própria. Sem
-- autor e sem privacidade: é dado da clínica, não recado de pessoa.
--
-- unique (clinic_id, label) por clínica, mas o label é livre entre clínicas —
-- por isso a UI oferece autocomplete dos labels já usados: sem isso viram
-- "Horário contato" aqui e "Horário de contato" ali, e a comparação entre
-- clínicas morre.
create table if not exists clinic_details (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  label      text not null,
  value      text,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, label)
);

create index if not exists clinic_details_clinic_idx
  on clinic_details (clinic_id, position, label);

-- ── updated_at + RLS/grants ──────────────────────────────────────────────────
drop trigger if exists clinic_notes_updated_at on clinic_notes;
create trigger clinic_notes_updated_at before update on clinic_notes
  for each row execute function set_updated_at();

drop trigger if exists clinic_details_updated_at on clinic_details;
create trigger clinic_details_updated_at before update on clinic_details
  for each row execute function set_updated_at();

-- Fecha para TODO acesso via PostgREST — nada de `grant ... to authenticated`
-- com policy `using (true)`, que é a convenção da maioria das tabelas (0069).
-- Aqui ela seria um furo: o app não usa mais Supabase Auth (todo acesso é
-- service role, ver src/lib/supabase/server.ts), então `authenticated` não é
-- ninguém deste app — mas um JWT qualquer do projeto leria as anotações
-- PRIVADAS de todo mundo, e a privacidade aqui é regra de servidor sem rede de
-- segurança no banco. O precedente correto é app_users (0025), que também
-- guarda dado que o navegador nunca deve ver: revoga anon E authenticated.
alter table clinic_notes enable row level security;
revoke all on clinic_notes from anon, authenticated;
grant all on clinic_notes to service_role;

alter table clinic_details enable row level security;
revoke all on clinic_details from anon, authenticated;
grant all on clinic_details to service_role;
