-- Auth próprio: sai do Supabase Auth para uma tabela simples de usuários.
-- app_users mantém os MESMOS UUIDs de auth.users/user_profiles (as carteiras
-- em clinics.developer_id e os checklists em check_items.owner_id continuam
-- válidos) e copia o hash bcrypt de auth.users.encrypted_password — as senhas
-- atuais continuam funcionando (bcryptjs verifica $2a$/$2b$).
-- user_profiles fica para trás (stale) até o deploy novo subir; remoção em
-- migration futura.
set search_path = clinic_control;

create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,      -- sempre minúsculo
  name          text,
  password_hash text,                      -- bcrypt; null = conta ainda sem senha
  role          text not null default 'desenvolvedor' check (role in ('gestor', 'desenvolvedor')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger app_users_updated_at before update on app_users
  for each row execute function set_updated_at();

-- Credenciais: nenhum acesso via PostgREST — só service_role (server actions).
alter table app_users enable row level security;
revoke all on app_users from anon, authenticated;

-- Copia os usuários existentes preservando o id e o hash da senha.
insert into app_users (id, email, name, role, password_hash)
select p.id, lower(p.email), p.name, p.role, u.encrypted_password
from user_profiles p
join auth.users u on u.id = p.id
where p.email is not null
on conflict (id) do nothing;

-- Re-aponta as FKs que referenciavam auth.users.
alter table clinics drop constraint if exists clinics_developer_id_fkey;
alter table clinics
  add constraint clinics_developer_id_fkey
  foreign key (developer_id) references app_users(id) on delete set null;

alter table check_items drop constraint if exists check_items_owner_id_fkey;
alter table check_items
  add constraint check_items_owner_id_fkey
  foreign key (owner_id) references app_users(id) on delete cascade;

alter table user_invites drop constraint if exists user_invites_invited_by_fkey;
alter table user_invites
  add constraint user_invites_invited_by_fkey
  foreign key (invited_by) references app_users(id) on delete set null;

-- O Auth do Supabase deixa de alimentar perfis.
drop trigger if exists on_auth_user_created_clinic_control on auth.users;
drop function if exists clinic_control.handle_new_user();
drop function if exists clinic_control.is_gestor();
