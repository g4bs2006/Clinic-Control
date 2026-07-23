-- Notificações in-app (sem WhatsApp/e-mail). Uma linha por DESTINATÁRIO, com
-- snapshot de título/corpo (fica legível mesmo se a origem mudar/for excluída) e
-- uma URL de deep-link (ex.: /tarefas/<id>, página que já construímos).
--
-- Escrita: sempre via service_role (Server Actions/cron) — o helper createNotifications.
-- Leitura no app: também via service_role, escopada por recipient_id na action.
-- Leitura via Realtime (browser): o client recebe um JWT curto assinado a partir
-- da nossa sessão própria (role "authenticated", sub = app_user.id); por isso a
-- tabela tem RLS + policy own-select + entra na publicação supabase_realtime.
set search_path to clinic_control, public;

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references app_users(id) on delete cascade,
  actor_id     uuid references app_users(id) on delete set null,
  type         text not null,   -- mention|task_assigned|task_comment|task_due_soon|task_overdue|acompanhamento_assigned
  title        text not null,   -- snapshot ("Fulano mencionou você")
  body         text,            -- snapshot (trecho do comentário, título da tarefa…)
  entity_type  text,            -- 'task' | 'acompanhamento' | 'comment'
  entity_id    uuid,
  url          text,            -- deep-link, ex.: /tarefas/<id>
  dedupe_key   text unique,     -- evita duplicata (nulls são distintos: eventos sempre inserem;
                                --                   o cron de prazo usa uma chave estável)
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Lista/badge do destinatário: "minhas não-lidas, mais recentes primeiro".
create index if not exists notifications_recipient_idx
  on notifications (recipient_id, read_at, created_at desc);

-- ── RLS: o browser (via Realtime, role authenticated) só enxerga as suas ────────
alter table notifications enable row level security;
revoke all on notifications from anon;
grant select on notifications to authenticated;

drop policy if exists notifications_own_select on notifications;
create policy notifications_own_select on notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- ── Realtime: expor a tabela na publicação e guardar a linha antiga em updates ──
alter table notifications replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table clinic_control.notifications;
    exception when duplicate_object then null;  -- já é membro
    end;
  end if;
end $$;
