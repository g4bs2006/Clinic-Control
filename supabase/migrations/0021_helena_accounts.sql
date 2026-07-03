-- Espelho das contas Helena do parceiro Contact.IA (todas, vinculadas ou não).
-- Sincronizado sob demanda pela Server Action syncHelenaAccounts (página /helena),
-- que usa o HELENA_MASTER_TOKEN. Tokens NUNCA são persistidos aqui — apenas
-- metadados (id, nome, criação); o valor cifrado continua só em clinic_integrations.
create table if not exists helena_accounts (
  company_id        uuid primary key,
  clinic_id         uuid references clinics(id) on delete set null,
  name              text,
  legal_name        text,
  document_id       text,
  email             text,
  phone             text,
  setup_status      text,               -- PRODUCTION, SUBSCRIPTION_SUSPENDED, ...
  active            boolean not null default true,
  config            jsonb,              -- plano/limites (resources, flags)
  tokens_meta       jsonb,              -- [{ id, name, createdAt }]
  webhooks          jsonb,              -- [{ id, name, url, enabled, events[] }]
  webhooks_error    text,               -- ex.: nenhum token com permissão (401)
  helena_created_at timestamptz,
  synced_at         timestamptz not null default now()
);
create index if not exists helena_accounts_clinic_idx on helena_accounts (clinic_id);

alter table helena_accounts enable row level security;
grant select on helena_accounts to authenticated;
revoke all on helena_accounts from anon;
drop policy if exists helena_accounts_auth_select on helena_accounts;
create policy helena_accounts_auth_select on helena_accounts
  for select to authenticated using (true);
-- Escrita apenas via service_role (Server Action de sync), que ignora RLS.
