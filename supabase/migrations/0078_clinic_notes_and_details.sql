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
