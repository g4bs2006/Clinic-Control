create type clinic_mode as enum ('auto', 'manual');
create type contract_status as enum ('active', 'suspended', 'archived');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  state text,            -- UF (2 letras)
  region text,           -- derivada do estado
  lat double precision,
  lng double precision,
  mode clinic_mode not null default 'manual',
  contract_status contract_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table funnel_steps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  counts_as_scheduling boolean not null default false,
  counts_as_closing boolean not null default false
);

create table status_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  rate_min numeric not null,   -- fração 0..1
  rate_max numeric not null,
  color text not null,
  position int not null
);

-- Seed: 9 etapas do funil padrão
insert into funnel_steps (name, position, counts_as_scheduling, counts_as_closing) values
  ('Leads', 1, false, false),
  ('Agendados', 2, true, false),
  ('Não Agendados', 3, false, false),
  ('Reagendados', 4, true, false),
  ('Cancelados', 5, false, false),
  ('Faltosos', 6, false, false),
  ('Orçamento em Aberto', 7, false, false),
  ('Compareceram e Não Fecharam', 8, false, false),
  ('Compareceram e Fecharam', 9, false, true);

-- Seed: faixas de status iniciais (taxa = agendados/leads)
insert into status_rules (label, rate_min, rate_max, color, position) values
  ('Risco Churn', 0.00, 0.05, '#9ca3af', 1),
  ('Preocupante', 0.05, 0.09, '#f97316', 2),
  ('Ok/Atenção',  0.09, 0.11, '#eab308', 3),
  ('Bom',         0.11, 0.13, '#3b82f6', 4),
  ('Ótimo',       0.13, 1.01, '#22c55e', 5);

-- updated_at automático
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger clinics_updated_at before update on clinics
  for each row execute function set_updated_at();
