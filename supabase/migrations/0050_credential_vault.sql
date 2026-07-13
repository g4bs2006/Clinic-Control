-- Cofre de credenciais de serviços externos (Contact.IA, Helena, n8n, Cal.com,
-- Supabase, GitHub, ClickUp, dashboards, etc.) — substitui o documento no
-- Google Docs. Segredo (senha/token) fica CIFRADO (AES-256-GCM, reaproveita
-- src/lib/crypto/token.ts / HELENA_TOKEN_ENC_KEY — utilitário genérico apesar
-- do nome). Login/URL/notas ficam em texto puro (não são o segredo em si).
--
-- Mesmo modelo de segurança de clinic_integrations: RLS ligado, sem policy
-- para anon/authenticated — só o service_role (backend) acessa. Acesso na
-- aplicação é restrito a role='gestor' (mais rígido que o resto do sistema,
-- que trata "todo staff é confiável"; aqui o dano de um segredo exposto é
-- maior, então a régua sube).
set search_path to clinic_control, public;

create table credential_vault (
  id uuid primary key default gen_random_uuid(),
  service text not null,               -- ex: "Supabase", "n8n", "Cal.com"
  category text,                       -- agrupamento livre na tela (ex: "Dashboards")
  login text,                          -- e-mail/usuário — não é o segredo
  secret_encrypted text,               -- iv:tag:ciphertext (AES-256-GCM); null = sem segredo (só login/URL)
  url text,
  notes text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger credential_vault_updated_at before update on credential_vault
  for each row execute function set_updated_at();

-- Auditoria: quem revelou qual segredo e quando.
create table credential_vault_access_log (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references credential_vault(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  revealed_at timestamptz not null default now()
);

create index credential_vault_access_log_credential_id_idx on credential_vault_access_log(credential_id);

alter table credential_vault enable row level security;
revoke all on credential_vault from anon;
revoke all on credential_vault from authenticated;

alter table credential_vault_access_log enable row level security;
revoke all on credential_vault_access_log from anon;
revoke all on credential_vault_access_log from authenticated;
-- Sem policy para anon/authenticated => acesso negado por padrão.
-- O service_role (usado apenas por Server Actions no backend) ignora RLS.
