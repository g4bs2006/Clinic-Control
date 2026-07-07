-- Rate limit de login: registra falhas de autenticação por e-mail para bloquear
-- força bruta (ver src/lib/auth/actions.ts). Cada falha insere uma linha; um
-- login bem-sucedido limpa as do e-mail. Bloqueio = >= 8 falhas em 15 min.
set search_path to clinic_control, public;

create table if not exists login_attempts (
  id           bigint generated always as identity primary key,
  email        text not null,
  ip           text,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_email_time_idx
  on login_attempts (email, attempted_at desc);

alter table login_attempts enable row level security;
revoke all on login_attempts from anon;
grant all on login_attempts to service_role, authenticated;
