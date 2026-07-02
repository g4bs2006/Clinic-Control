-- Provisionamento automático da clínica na Helena (conta, token, usuário do
-- dono, equipes padrão, tags e detecção do painel). Cada etapa é rastreada e
-- re-executável (idempotente) — o painel de CRM não tem endpoint de criação
-- na API, então a etapa 'panel' fica em 'manual' até ser criado na UI da
-- Helena e detectado pelo app.

-- Dados do dono/documento usados na criação da conta Helena.
alter table clinics add column if not exists owner_name  text;
alter table clinics add column if not exists owner_email text;
alter table clinics add column if not exists owner_phone text;
alter table clinics add column if not exists legal_name  text;
alter table clinics add column if not exists document_id text; -- CNPJ ou CPF (só dígitos)

create table if not exists clinic_provisioning (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  step        text not null, -- account | token | owner_user | teams | tags | panel
  status      text not null default 'pending' check (status in ('pending','done','error','manual')),
  detail      text,          -- company_id, mensagem de erro ou instrução manual
  executed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (clinic_id, step)
);
create index if not exists clinic_provisioning_clinic_idx on clinic_provisioning (clinic_id);

alter table clinic_provisioning enable row level security;
grant all on clinic_provisioning to authenticated, service_role;
revoke all on clinic_provisioning from anon;
drop policy if exists clinic_provisioning_auth_all on clinic_provisioning;
create policy clinic_provisioning_auth_all on clinic_provisioning
  for all to authenticated using (true) with check (true);
