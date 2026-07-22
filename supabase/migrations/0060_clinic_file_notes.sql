-- Anotações em arquivos/pastas da clínica. Como "pasta" não é entidade (a árvore
-- é deduzida dos caminhos do Storage), a nota é indexada pelo CAMINHO relativo —
-- serve tanto para pasta ("Configuracao") quanto para arquivo ("Configuracao/regras.md").
set search_path to clinic_control, public;

create table if not exists clinic_file_notes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  path        text not null,   -- caminho relativo à clínica (pasta ou arquivo)
  note        text not null,
  updated_by  uuid references app_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinic_id, path)
);

create index if not exists clinic_file_notes_clinic_idx on clinic_file_notes (clinic_id);
