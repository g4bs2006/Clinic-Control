-- Dependências entre tarefas — "bloqueada por" (epic #33, sub-issue #34).
--
-- N:N entre tarefa bloqueada (task_id) e tarefa bloqueadora (depends_on_task_id).
-- Ciclo direto (A bloqueada por A) é pego pelo CHECK abaixo; ciclo indireto
-- (A bloqueada por B bloqueada por A) não dá pra expressar num CHECK simples —
-- fica a cargo da action (addDependency faz um BFS no grafo antes de inserir;
-- ver src/lib/tasks/dependencies.ts). Decisão registrada no ADR 0008.
set search_path to clinic_control, public;

create table if not exists task_dependencies (
  task_id            uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  created_by         uuid references app_users(id) on delete set null,
  created_at         timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);
-- Índice reverso: "quais tarefas essa aqui bloqueia" (visão inversa no detalhe).
create index if not exists task_dependencies_depends_on_idx on task_dependencies (depends_on_task_id);

alter table task_dependencies enable row level security;
revoke all on task_dependencies from anon;
grant all on task_dependencies to authenticated, service_role;
drop policy if exists task_dependencies_auth_all on task_dependencies;
create policy task_dependencies_auth_all on task_dependencies
  for all to authenticated using (true) with check (true);
