-- Itens de checkbox configuráveis (catálogo global) e valores por clínica.
-- Os itens são gerenciados em /configuracoes; cada clínica pode marcar/desmarcar.

create table check_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  position int not null,
  created_at timestamptz not null default now()
);

create table clinic_checks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  check_item_id uuid not null references check_items(id) on delete cascade,
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (clinic_id, check_item_id)
);

create index clinic_checks_clinic_idx on clinic_checks (clinic_id);

create trigger clinic_checks_updated_at before update on clinic_checks
  for each row execute function set_updated_at();

-- RLS: equipe interna autenticada tem acesso total; anon bloqueado.
alter table check_items enable row level security;
revoke all on check_items from anon;
create policy check_items_authenticated_all on check_items
  for all to authenticated using (true) with check (true);

alter table clinic_checks enable row level security;
revoke all on clinic_checks from anon;
create policy clinic_checks_authenticated_all on clinic_checks
  for all to authenticated using (true) with check (true);
