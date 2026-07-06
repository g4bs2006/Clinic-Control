-- Tarefas nativas — substitui o ClickUp para as pendências da carteira.
-- Fluxo: resumo diário da IA grava highlights.pendencias[] em
-- whatsapp_daily_summaries → trigger expande cada item em task_suggestions
-- (fila de revisão) → humano aceita (vira task) ou descarta. Criação manual
-- de tasks também é suportada desde o v1.
set search_path to clinic_control, public;

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid references clinics(id) on delete cascade, -- null = tarefa interna, sem clínica
  title        text not null,
  description  text,
  category     text not null default 'outro'
    check (category in ('atendimento', 'financeiro', 'suporte_tecnico', 'onboarding', 'contrato', 'outro')),
  priority     text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  status       text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  assigned_to  uuid references app_users(id) on delete set null,
  due_date     date,
  source       text not null default 'manual' check (source in ('manual', 'ia')),
  created_by   uuid references app_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tasks_clinic_idx on tasks (clinic_id);
create index if not exists tasks_assigned_idx on tasks (assigned_to, status);
create index if not exists tasks_status_idx on tasks (status, due_date);

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

alter table tasks enable row level security;
revoke all on tasks from anon;

-- ── Sugestões de tarefa extraídas dos resumos diários (fila de revisão) ─────
create table if not exists task_suggestions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  summary_id  uuid not null references whatsapp_daily_summaries(id) on delete cascade,
  text        text not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  task_id     uuid references tasks(id) on delete set null,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references app_users(id) on delete set null,
  unique (clinic_id, summary_id, text)
);
create index if not exists task_suggestions_status_idx on task_suggestions (status, created_at desc);

alter table task_suggestions enable row level security;
revoke all on task_suggestions from anon;

-- ── Trigger: expande highlights.pendencias[] em sugestões ────────────────────
-- Roda a cada insert/update de resumo diário; idempotente via unique key acima
-- (on conflict do nothing — reprocessar o mesmo resumo não duplica).
create or replace function expand_pendencias_to_suggestions()
returns trigger
language plpgsql
set search_path = clinic_control, public
as $$
begin
  insert into task_suggestions (clinic_id, summary_id, text)
  select new.clinic_id, new.id, trim(pendencia.value #>> '{}')
  from jsonb_array_elements(coalesce(new.highlights -> 'pendencias', '[]'::jsonb)) as pendencia(value)
  where trim(pendencia.value #>> '{}') <> ''
  on conflict (clinic_id, summary_id, text) do nothing;
  return new;
end;
$$;

drop trigger if exists whatsapp_daily_summaries_expand_pendencias on whatsapp_daily_summaries;
create trigger whatsapp_daily_summaries_expand_pendencias
  after insert or update of highlights on whatsapp_daily_summaries
  for each row execute function expand_pendencias_to_suggestions();
