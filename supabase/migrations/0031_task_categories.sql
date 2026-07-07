-- Categorias de tarefa configuráveis (antes fixas em código).
-- category deixa de ter CHECK fixo e passa a referenciar task_categories.slug —
-- desativar (active=false) preserva o histórico das tarefas já criadas com
-- aquele slug; excluir só é permitido se nenhuma tarefa usa a categoria (FK protege).
set search_path to clinic_control, public;

create table if not exists task_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  label      text not null,
  position   int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into task_categories (slug, label, position) values
  ('atendimento', 'Atendimento', 1),
  ('financeiro', 'Financeiro', 2),
  ('suporte_tecnico', 'Suporte técnico', 3),
  ('onboarding', 'Onboarding', 4),
  ('contrato', 'Contrato', 5),
  ('outro', 'Outro', 6)
on conflict (slug) do nothing;

alter table tasks drop constraint if exists tasks_category_check;
alter table tasks
  add constraint tasks_category_fkey foreign key (category)
  references task_categories(slug) on update cascade;

alter table task_categories enable row level security;
revoke all on task_categories from anon;
