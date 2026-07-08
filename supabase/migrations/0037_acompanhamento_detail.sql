-- Comentários + anexos dos acompanhamentos (espelha o que as tarefas têm).
-- Os arquivos reaproveitam o bucket de storage `task-attachments`, com o path
-- prefixado por `acomp/<id>/` para não colidir com os anexos de tarefa.
set search_path to clinic_control, public;

create table if not exists acompanhamento_comments (
  id                 uuid primary key default gen_random_uuid(),
  acompanhamento_id  uuid not null references acompanhamentos(id) on delete cascade,
  author_id          uuid references app_users(id) on delete set null,
  body               text not null,
  kind               text not null default 'comment' check (kind in ('comment', 'system')),
  created_at         timestamptz not null default now()
);
create index if not exists acompanhamento_comments_idx on acompanhamento_comments (acompanhamento_id, created_at);

create table if not exists acompanhamento_attachments (
  id                 uuid primary key default gen_random_uuid(),
  acompanhamento_id  uuid not null references acompanhamentos(id) on delete cascade,
  file_path          text not null,
  file_name          text not null,
  content_type       text,
  size_bytes         bigint,
  uploaded_by        uuid references app_users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists acompanhamento_attachments_idx on acompanhamento_attachments (acompanhamento_id, created_at desc);

alter table acompanhamento_comments enable row level security;
alter table acompanhamento_attachments enable row level security;
revoke all on acompanhamento_comments from anon;
revoke all on acompanhamento_attachments from anon;
grant all on acompanhamento_comments to authenticated, service_role;
grant all on acompanhamento_attachments to authenticated, service_role;
drop policy if exists acompanhamento_comments_auth_all on acompanhamento_comments;
create policy acompanhamento_comments_auth_all on acompanhamento_comments
  for all to authenticated using (true) with check (true);
drop policy if exists acompanhamento_attachments_auth_all on acompanhamento_attachments;
create policy acompanhamento_attachments_auth_all on acompanhamento_attachments
  for all to authenticated using (true) with check (true);
