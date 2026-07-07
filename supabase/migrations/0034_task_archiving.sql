-- Arquivamento de tarefas: tarefas concluídas/canceladas antigas somem das views
-- ativas (lista, board, painel da clínica) sem serem apagadas — o histórico fica
-- preservado. `archived_at` não-nulo = arquivada. O app filtra `archived_at is null`
-- nas listagens; a função abaixo é chamada por pg_cron diariamente.
set search_path to clinic_control, public;

alter table tasks add column if not exists archived_at timestamptz;
create index if not exists tasks_archived_idx on tasks (archived_at);

-- Arquiva tarefas concluídas/canceladas cujo último toque (conclusão ou
-- atualização) é mais antigo que `older_than_days`. Retorna quantas arquivou.
create or replace function clinic_control.archive_old_done_tasks(older_than_days int default 7)
returns int
language plpgsql
set search_path = clinic_control, public
as $$
declare
  n int;
begin
  update tasks
     set archived_at = now()
   where archived_at is null
     and status in ('concluida', 'cancelada')
     and coalesce(completed_at, updated_at) < now() - make_interval(days => older_than_days);
  get diagnostics n = row_count;
  return n;
end;
$$;
