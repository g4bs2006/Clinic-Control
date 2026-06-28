create type snapshot_source as enum ('auto', 'manual');

create table monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  year_month text not null,              -- 'YYYY-MM' (UTC)
  leads int not null default 0,
  scheduled int not null default 0,
  rate numeric not null default 0,       -- agendados/leads (fração 0..1)
  status text,                           -- rótulo calculado no congelamento
  status_override text,                  -- sobrescreve o status calculado
  source snapshot_source not null,
  revenue numeric not null default 0,    -- só clínicas auto (faturamento)
  step_counts jsonb,                     -- contagem das 9 etapas (auto)
  frozen boolean not null default false, -- true quando o mês foi congelado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, year_month)
);

create index monthly_snapshots_year_month_idx on monthly_snapshots (year_month);

create trigger monthly_snapshots_updated_at before update on monthly_snapshots
  for each row execute function set_updated_at();

alter table monthly_snapshots enable row level security;
revoke all on monthly_snapshots from anon;
create policy monthly_snapshots_authenticated_all on monthly_snapshots
  for all to authenticated using (true) with check (true);
