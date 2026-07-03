-- Convites por e-mail pré-aprovado (substitui os links de convite por e-mail,
-- que são de uso único e morrem no preview do WhatsApp). Fluxo:
--   1. Gestor cadastra o e-mail em Configurações → Usuários.
--   2. A pessoa acessa "Novo por aqui?" no login, informa o e-mail e cria a senha.
--   3. A action ativa a conta (Auth admin), marca used_at e aplica o papel.
create table if not exists user_invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,           -- sempre minúsculo
  role       text not null default 'desenvolvedor' check (role in ('gestor', 'desenvolvedor')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at    timestamptz                      -- null = pendente
);

alter table user_invites enable row level security;
grant select on user_invites to authenticated;
revoke all on user_invites from anon;
drop policy if exists user_invites_auth_select on user_invites;
create policy user_invites_auth_select on user_invites
  for select to authenticated using (true);
-- Escrita e ativação apenas via service_role (Server Actions com gate no código).

-- Seed: os 3 devs que já estão pendentes de acesso.
insert into user_invites (email) values
  ('andre.alves@escalarodonto.com.br'),
  ('daniel@escalarodonto.com.br'),
  ('joao.henrique@escalarodonto.com.br')
on conflict (email) do nothing;
