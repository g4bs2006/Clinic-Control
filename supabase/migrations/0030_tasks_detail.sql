-- Sistema de tarefas completo: subtarefas reais, anexos, comentários/atividade.
set search_path to clinic_control, public;

-- ── Subtarefas (tasks filhas de outra task) ──────────────────────────────────
alter table tasks add column if not exists parent_task_id uuid references tasks(id) on delete cascade;
create index if not exists tasks_parent_idx on tasks (parent_task_id);

-- ── Anexos ───────────────────────────────────────────────────────────────────
create table if not exists task_attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  file_path     text not null,   -- caminho no bucket task-attachments: <task_id>/<arquivo>
  file_name     text not null,
  content_type  text,
  size_bytes    bigint,
  uploaded_by   uuid references app_users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists task_attachments_task_idx on task_attachments (task_id, created_at);
alter table task_attachments enable row level security;
revoke all on task_attachments from anon;

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- ── Comentários e histórico de atividade (unificados numa timeline) ─────────
create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author_id  uuid references app_users(id) on delete set null,
  body       text not null,
  kind       text not null default 'comment' check (kind in ('comment', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on task_comments (task_id, created_at);
alter table task_comments enable row level security;
revoke all on task_comments from anon;
