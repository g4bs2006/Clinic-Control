-- notify_task_due (última versão em 0084): uma tarefa interna "em aprovação"
-- ainda é trabalho aberto para o responsável — continua avisando prazo.
-- Tarefa de clínica nunca tem esse status (ADR 0010), então o acréscimo é
-- inofensivo para elas.
set search_path to clinic_control, public;

create or replace function clinic_control.notify_task_due()
returns void
language plpgsql
security definer
set search_path = clinic_control, public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into notifications (recipient_id, type, title, body, entity_type, entity_id, url, dedupe_key)
  select
    ta.user_id,
    case when t.due_date < today then 'task_overdue' else 'task_due_soon' end,
    case
      when t.due_date < today  then 'Tarefa atrasada'
      when t.due_date = today  then 'Tarefa vence hoje'
      else 'Tarefa vence amanhã'
    end,
    t.title,
    'task',
    t.id,
    '/tarefas/' || t.id,
    (case when t.due_date < today then 'task_overdue' else 'task_due_soon' end)
      || ':' || t.id || ':' || t.due_date || ':' || ta.user_id
  from tasks t
  join task_assignees ta on ta.task_id = t.id
  where t.status in ('pendente', 'em_andamento', 'em_aprovacao')
    and t.archived_at is null
    and t.due_date is not null
    and t.due_date <= today + 1
    and (t.snoozed_until is null or t.snoozed_until <= today)
  on conflict (dedupe_key) do nothing;
end;
$$;
