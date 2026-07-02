-- Registro de desligamentos (churns) da carteira.
-- Registrar um churn também arquiva a clínica (contract_status='archived') via app.
create table if not exists clinic_churns (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  churn_month  text not null check (churn_month ~ '^\d{4}-\d{2}$'), -- YYYY-MM
  reason       text,            -- categoria (lista canônica no app)
  notes        text,
  lost_revenue numeric,         -- mensalidade/receita mensal perdida (R$)
  created_at   timestamptz not null default now()
);
create index if not exists clinic_churns_month_idx on clinic_churns (churn_month desc);
create index if not exists clinic_churns_clinic_idx on clinic_churns (clinic_id);

alter table clinic_churns enable row level security;
grant all on clinic_churns to authenticated;
revoke all on clinic_churns from anon;
drop policy if exists clinic_churns_auth_all on clinic_churns;
create policy clinic_churns_auth_all on clinic_churns
  for all to authenticated using (true) with check (true);
