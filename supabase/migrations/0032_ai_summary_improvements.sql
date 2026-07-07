-- Melhorias nos resumos diários por IA:
-- (1) comparação temporal — feita no prompt, sem mudança de schema aqui;
-- (2) severidade explícita (substitui o uso solto de risco_churn) que passa a
--     definir a prioridade da tarefa quando uma sugestão é aceita;
-- (4) trigger de sugestões não duplica quando já existe tarefa aberta parecida
--     (similaridade de texto via pg_trgm);
-- (5) log de uso de tokens de IA (resumo diário, subtarefas via IA, e futuros
--     usos) para estimar custo em Configurações.
set search_path to clinic_control, public;

create extension if not exists pg_trgm;

alter table whatsapp_daily_summaries
  add column if not exists severity text not null default 'baixa'
    check (severity in ('baixa', 'media', 'alta')),
  add column if not exists prompt_tokens int not null default 0,
  add column if not exists completion_tokens int not null default 0;

alter table task_suggestions
  add column if not exists severity text not null default 'media'
    check (severity in ('baixa', 'media', 'alta'));

-- ── Log de uso de IA (tokens) ─────────────────────────────────────────────────
create table if not exists ai_usage_log (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  model             text not null,
  purpose           text not null
    check (purpose in ('resumo_diario', 'subtarefas_ia', 'deteccao_padroes')),
  prompt_tokens     int not null default 0,
  completion_tokens int not null default 0,
  clinic_id         uuid references clinics(id) on delete set null,
  reference_id      uuid,
  created_at        timestamptz not null default now()
);
create index if not exists ai_usage_log_created_idx on ai_usage_log (created_at desc);
create index if not exists ai_usage_log_purpose_idx on ai_usage_log (purpose, created_at desc);

alter table ai_usage_log enable row level security;
revoke all on ai_usage_log from anon;
grant all on ai_usage_log to authenticated, service_role;
drop policy if exists ai_usage_log_auth_all on ai_usage_log;
create policy ai_usage_log_auth_all on ai_usage_log
  for all to authenticated using (true) with check (true);

-- ── Trigger: propaga severidade + evita sugestão duplicada quando já existe
-- tarefa aberta com título parecido (similaridade > 0.35) ───────────────────
create or replace function clinic_control.expand_pendencias_to_suggestions()
returns trigger
language plpgsql
set search_path = clinic_control, public
as $$
begin
  insert into task_suggestions (clinic_id, summary_id, text, severity)
  select new.clinic_id, new.id, trim(pendencia.value #>> '{}'), new.severity
  from jsonb_array_elements(coalesce(new.highlights -> 'pendencias', '[]'::jsonb)) as pendencia(value)
  where trim(pendencia.value #>> '{}') <> ''
    and not exists (
      select 1 from tasks t
      where t.clinic_id = new.clinic_id
        and t.status in ('pendente', 'em_andamento')
        and similarity(t.title, trim(pendencia.value #>> '{}')) > 0.35
    )
  on conflict (clinic_id, summary_id, text) do nothing;
  return new;
end;
$$;
