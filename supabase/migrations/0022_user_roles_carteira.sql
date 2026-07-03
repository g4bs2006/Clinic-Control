-- Níveis de usuário (gestor vê tudo; desenvolvedor só a própria carteira) e
-- carteira: 1 desenvolvedor responsável por clínica (clinics.developer_id).
-- Fase 1: estrutura + seed. O enforcement por RLS entra numa fase seguinte,
-- quando os desenvolvedores ganharem login (hoje só existe o gestor).
create table if not exists user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  role       text not null default 'desenvolvedor' check (role in ('gestor', 'desenvolvedor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_profiles_updated_at before update on user_profiles
  for each row execute function set_updated_at();

alter table user_profiles enable row level security;
grant select on user_profiles to authenticated;
revoke all on user_profiles from anon;
drop policy if exists user_profiles_auth_select on user_profiles;
create policy user_profiles_auth_select on user_profiles
  for select to authenticated using (true);
-- Escrita (trocar papel) apenas via service_role, com checagem de gestor no código.

-- Perfil criado automaticamente quando um usuário novo é cadastrado no Auth.
create or replace function clinic_control.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = clinic_control, public
as $$
begin
  insert into clinic_control.user_profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_clinic_control on auth.users;
create trigger on_auth_user_created_clinic_control
  after insert on auth.users
  for each row execute function clinic_control.handle_new_user();

-- Carteira: desenvolvedor responsável pela clínica.
alter table clinics add column if not exists developer_id uuid references auth.users(id) on delete set null;
create index if not exists clinics_developer_idx on clinics (developer_id);

-- Helper para as políticas RLS da fase 2.
create or replace function clinic_control.is_gestor()
returns boolean
language sql stable security definer
set search_path = clinic_control
as $$
  select coalesce((select role = 'gestor' from user_profiles where id = auth.uid()), false);
$$;

-- Seed: perfis para os usuários existentes; Gabriel é o gestor.
insert into user_profiles (id, email, name, role)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  case when email = 'gabriel.rodrigues@escalarodonto.com.br' then 'gestor' else 'desenvolvedor' end
from auth.users
on conflict (id) do nothing;
