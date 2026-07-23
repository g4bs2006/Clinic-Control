-- Lembretes de prazo por notificação in-app. Um pg_cron diário (08h BRT) varre
-- as tarefas abertas do responsável e cria notificações:
--   due_date = amanhã/hoje  → task_due_soon  ("vence amanhã/hoje")
--   due_date < hoje          → task_overdue   ("atrasada")
-- O dedupe_key inclui a due_date, então cada tarefa gera no máximo UM aviso de
-- "vence" e UM de "atrasada" — sem repetir todo dia. Ignora tarefas adiadas
-- (snooze), coerente com a lista/Panorama. Roda como security definer porque a
-- tabela notifications tem RLS (a função é dona → insere sem policy de insert).
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
    t.assigned_to,
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
      || ':' || t.id || ':' || t.due_date
  from tasks t
  where t.assigned_to is not null
    and t.status in ('pendente', 'em_andamento')
    and t.archived_at is null
    and t.due_date is not null
    and t.due_date <= today + 1
    and (t.snoozed_until is null or t.snoozed_until <= today)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Agenda o cron (08h BRT = 11h UTC). Reagenda de forma idempotente.
do $$
begin
  perform cron.unschedule('notify-task-due-daily');
exception when others then null;  -- ainda não existe
end $$;

select cron.schedule(
  'notify-task-due-daily',
  '0 11 * * *',
  $$select clinic_control.notify_task_due();$$
);
