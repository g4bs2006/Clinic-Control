-- Tarefa atribuída a mais de um dev (issue #93 / pedido direto da operação).
--
-- task_assignees substitui tasks.assigned_to (FK única) por uma LISTA PLANA —
-- todo mundo na lista é igualmente responsável, sem "principal" e sem
-- "colaborador secundário". Escopo de carteira, notificação de atribuição e
-- "minhas tarefas" passam a checar pertencimento aqui em vez de comparar uma
-- coluna. task_recurrences.assigned_to NÃO muda — a regra recorrente continua
-- com um responsável fixo (ou o dev da carteira, no fan-out); é a OCORRÊNCIA
-- materializada que nasce com esse responsável já na lista.
set search_path to clinic_control, public;

create table if not exists task_assignees (
  task_id     uuid not null references tasks(id) on delete cascade,
  user_id     uuid not null references app_users(id) on delete cascade,
  assigned_by uuid references app_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists task_assignees_user_idx on task_assignees (user_id);

alter table task_assignees enable row level security;
revoke all on task_assignees from anon;
grant all on task_assignees to authenticated, service_role;
drop policy if exists task_assignees_auth_all on task_assignees;
create policy task_assignees_auth_all on task_assignees
  for all to authenticated using (true) with check (true);

-- Backfill: o responsável único vira o primeiro (e único) membro da lista,
-- com a data de criação da tarefa como assigned_at (aproximação razoável —
-- não temos histórico de quando o campo foi preenchido).
insert into task_assignees (task_id, user_id, assigned_at)
select id, assigned_to, created_at from tasks
where assigned_to is not null
on conflict do nothing;

-- notify_task_due (0063): recriada para notificar CADA responsável da tarefa,
-- não só um. dedupe_key ganha o user_id no fim — cada responsável tem seu
-- próprio aviso de "vence"/"atrasada", sem duplicar entre eles nem repetir dia
-- a dia (mesma garantia de antes, só que por (tarefa, responsável)).
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
  where t.status in ('pendente', 'em_andamento')
    and t.archived_at is null
    and t.due_date is not null
    and t.due_date <= today + 1
    and (t.snoozed_until is null or t.snoozed_until <= today)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- assigned_to sai de cena: task_assignees é a única fonte de verdade daqui pra
-- frente. Breaking change deliberado — ver ADR 0008.
drop index if exists tasks_assigned_idx;
alter table tasks drop column if exists assigned_to;
