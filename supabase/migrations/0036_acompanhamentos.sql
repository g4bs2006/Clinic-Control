-- Acompanhamentos: entidade SEPARADA das tarefas. São itens de "ficar de olho"
-- (follow-ups passivos: aguardar/monitorar/acompanhar) que a IA extrai dos
-- resumos, com ciclo próprio (aberto → resolvido/dispensado). Tarefas de AÇÃO
-- continuam em `tasks`. As sugestões da fila passam a ter `kind` (acao|
-- acompanhamento) + `description` (o "porquê", opcional), e o trigger passa a
-- ler o novo campo highlights.tarefas [{acao, motivo?, tipo}].
set search_path to clinic_control, public;

-- ── Nova entidade ───────────────────────────────────────────────────────────
create table if not exists acompanhamentos (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid references clinics(id) on delete cascade,
  summary_id   uuid references whatsapp_daily_summaries(id) on delete set null,
  title        text not null,
  description  text,
  status       text not null default 'aberto'
    check (status in ('aberto', 'resolvido', 'dispensado')),
  severity     text not null default 'media' check (severity in ('baixa', 'media', 'alta')),
  assigned_to  uuid references app_users(id) on delete set null,
  source       text not null default 'manual' check (source in ('manual', 'ia')),
  created_by   uuid references app_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists acompanhamentos_clinic_idx on acompanhamentos (clinic_id);
create index if not exists acompanhamentos_status_idx on acompanhamentos (status, created_at desc);
create index if not exists acompanhamentos_assigned_idx on acompanhamentos (assigned_to, status);

drop trigger if exists acompanhamentos_updated_at on acompanhamentos;
create trigger acompanhamentos_updated_at before update on acompanhamentos
  for each row execute function set_updated_at();

alter table acompanhamentos enable row level security;
revoke all on acompanhamentos from anon;
grant all on acompanhamentos to authenticated, service_role;
drop policy if exists acompanhamentos_auth_all on acompanhamentos;
create policy acompanhamentos_auth_all on acompanhamentos
  for all to authenticated using (true) with check (true);

-- ── Sugestões: descrição + tipo (acao|acompanhamento) ───────────────────────
alter table task_suggestions
  add column if not exists description text,
  add column if not exists kind text not null default 'acao'
    check (kind in ('acao', 'acompanhamento'));

-- ── Trigger: passa a expandir highlights.tarefas [{acao, motivo?, tipo}] ─────
-- (antes lia highlights.pendencias[] como strings). pendencias/reclamacoes
-- continuam sendo geradas pelo prompt só para os alertas — não viram tarefa.
-- Dedup por similaridade contra o destino certo: 'acao' vs tasks abertas,
-- 'acompanhamento' vs acompanhamentos abertos.
create or replace function expand_pendencias_to_suggestions()
returns trigger
language plpgsql
set search_path = clinic_control, public
as $$
begin
  insert into task_suggestions (clinic_id, summary_id, text, description, kind, severity)
  select
    new.clinic_id,
    new.id,
    trim(t.value ->> 'acao'),
    nullif(trim(coalesce(t.value ->> 'motivo', '')), ''),
    case when t.value ->> 'tipo' = 'acompanhamento' then 'acompanhamento' else 'acao' end,
    new.severity
  from jsonb_array_elements(coalesce(new.highlights -> 'tarefas', '[]'::jsonb)) as t(value)
  where trim(coalesce(t.value ->> 'acao', '')) <> ''
    and case
      when t.value ->> 'tipo' = 'acompanhamento' then not exists (
        select 1 from acompanhamentos a
        where a.clinic_id = new.clinic_id
          and a.status = 'aberto'
          and similarity(a.title, trim(t.value ->> 'acao')) > 0.35
      )
      else not exists (
        select 1 from tasks tk
        where tk.clinic_id = new.clinic_id
          and tk.status in ('pendente', 'em_andamento')
          and similarity(tk.title, trim(t.value ->> 'acao')) > 0.35
      )
    end
  on conflict (clinic_id, summary_id, text) do nothing;
  return new;
end;
$$;
