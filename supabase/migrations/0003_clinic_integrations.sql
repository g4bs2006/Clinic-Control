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

alter table clinic_integrations enable row level security;
revoke all on clinic_integrations from anon;
create policy clinic_integrations_authenticated_all on clinic_integrations
  for all to authenticated using (true) with check (true);
