create table clinic_integrations (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  helena_token_encrypted text not null,   -- iv:tag:ciphertext (AES-256-GCM)
  panel_id uuid not null,
  company_id uuid,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinic_integrations_updated_at before update on clinic_integrations
  for each row execute function set_updated_at();

-- Tabela de CREDENCIAIS: guarda o token cifrado da Helena. Diferente das demais
-- tabelas, NÃO é exposta à superfície do browser. O acesso acontece só no servidor
-- via service_role (que ignora RLS). Por isso revogamos anon E authenticated, e não
-- criamos policy permissiva — com RLS ligado e sem policy, esses papéis são negados.
alter table clinic_integrations enable row level security;
revoke all on clinic_integrations from anon;
revoke all on clinic_integrations from authenticated;
-- Sem policy para anon/authenticated => acesso negado por padrão.
-- O service_role (usado apenas por Server Actions no backend) ignora RLS.
