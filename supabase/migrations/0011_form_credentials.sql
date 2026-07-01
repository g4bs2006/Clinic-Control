-- Credenciais vindas do formulário Google Forms / Google Sheets.
-- Cada linha = um preenchimento do formulário (pode haver vários por clínica,
-- um por unidade). O vínculo com a clínica (clinic_id) é feito manualmente
-- pela equipe no app.

set search_path to clinic_control, public;

create table if not exists form_credentials (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid references clinics(id) on delete set null,
  form_name     text not null,
  email         text,
  token         text not null,
  api_user      text,
  agenda_link   text,
  agenda_code   text,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists form_credentials_clinic_idx on form_credentials (clinic_id);

drop trigger if exists form_credentials_updated_at on form_credentials;
create trigger form_credentials_updated_at before update on form_credentials
  for each row execute function set_updated_at();

-- RLS: equipe autenticada = acesso total; anon bloqueado.
alter table form_credentials enable row level security;
revoke all on form_credentials from anon;
drop policy if exists form_credentials_auth_all on form_credentials;
create policy form_credentials_auth_all on form_credentials
  for all to authenticated using (true) with check (true);
