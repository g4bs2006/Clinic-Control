-- Categorias de checklist (editáveis), espelhando as categorias de tarefa.
-- Servem para organizar os itens fixos por etapa de implantação (Painéis, n8n,
-- Agente de IA, Chatbot). O item referencia a categoria por id; excluir a
-- categoria só solta o vínculo (set null), não apaga o item.
set search_path to clinic_control, public;

create table if not exists check_item_categories (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

insert into check_item_categories (label, position) values
  ('Painéis', 1),
  ('n8n', 2),
  ('Agente de IA', 3),
  ('Chatbot', 4),
  ('Geral', 5)
on conflict (label) do nothing;

alter table check_items
  add column if not exists category_id uuid references check_item_categories(id) on delete set null;

alter table check_item_categories enable row level security;
revoke all on check_item_categories from anon;
grant all on check_item_categories to authenticated, service_role;
drop policy if exists check_item_categories_auth_all on check_item_categories;
create policy check_item_categories_auth_all on check_item_categories
  for all to authenticated using (true) with check (true);
