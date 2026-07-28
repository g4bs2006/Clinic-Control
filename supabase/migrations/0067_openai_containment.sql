-- Contenção ativa de gasto OpenAI. Até aqui o monitor era passivo: detectava o
-- estouro do limite diário, abria um acompanhamento e esperava alguém clicar em
-- "Investigar contatos". Agora o alerta dispara sozinho a investigação das
-- últimas 48h, conclui na Helena as conversas que forem loop de robô e reporta
-- no grupo o que foi fechado, por quê e com quais evidências.
--
-- Fluxo: collect-openai-usage grava o alerta (0053/0055) e enfileira um RUN;
-- o endpoint /api/openai-containment/process (Next, onde vivem o token Helena
-- descriptografado e o client) executa; a notify?type=contencao envia ao grupo.
-- As três etapas são desacopladas por estas tabelas porque cada uma roda num
-- runtime diferente (Deno / Node / Deno) e nenhuma pode bloquear a outra.
set search_path to clinic_control, public;

-- ── Configuração (estende a linha única de openai_alert_settings) ───────────
alter table openai_alert_settings
  -- Kill switch. Desligado, o alerta continua sendo criado e o acompanhamento
  -- também — só a ação automática na Helena para.
  add column if not exists containment_enabled boolean not null default true,
  -- Teto de conversas concluídas por rodada. Trava de segurança contra um bug
  -- de critério virar fechamento em massa.
  add column if not exists containment_max_sessions int not null default 5,
  -- Critério de loop (E lógico dos três). Conservador de propósito: um falso
  -- positivo derruba o atendimento de um paciente real.
  add column if not exists containment_min_dup_ratio numeric(4, 2) not null default 0.50,
  add column if not exists containment_min_ia_msgs int not null default 40,
  add column if not exists containment_min_active_hours int not null default 12,
  -- Janela investigada, em dias.
  add column if not exists containment_window_days int not null default 2;

-- ── Fila de execuções ───────────────────────────────────────────────────────
-- Uma linha por alerta a conter. Mesmo padrão de job em background dos
-- report_jobs/suggestion_jobs: status + checkpoint, para o endpoint poder ser
-- re-disparado sem duplicar trabalho.
create table if not exists openai_containment_runs (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  alert_id       uuid references openai_usage_alerts(id) on delete set null,
  day            date not null,              -- dia (UTC) que disparou o alerta
  cost_usd       numeric(12, 6) not null,    -- gasto que motivou a contenção
  status         text not null default 'na fila'
                 check (status in ('na fila', 'rodando', 'concluido', 'erro')),
  -- Se false, a rodada apenas RELATA o que fecharia (usado quando o kill
  -- switch está desligado); nenhuma chamada de escrita na Helena acontece.
  dry_run        boolean not null default false,
  sessions_scanned int not null default 0,
  suspects_found   int not null default 0,
  sessions_closed  int not null default 0,
  error          text,
  -- Marca do envio ao grupo: a notify só pega runs com isto nulo, e é o que
  -- impede o relatório de sair duas vezes.
  notified_at    timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists openai_containment_runs_status_idx
  on openai_containment_runs (status, created_at);
-- Fila de notificação: runs terminados que ainda não foram para o grupo.
create index if not exists openai_containment_runs_pending_notify_idx
  on openai_containment_runs (finished_at) where notified_at is null;
-- Dedup: um run por (clínica, dia). Re-execuções do cron no mesmo dia não
-- enfileiram de novo — espelha o unique de openai_usage_alerts.
create unique index if not exists openai_containment_runs_clinic_day
  on openai_containment_runs (clinic_id, day);

drop trigger if exists openai_containment_runs_updated_at on openai_containment_runs;
create trigger openai_containment_runs_updated_at before update on openai_containment_runs
  for each row execute function set_updated_at();

-- ── Ações e evidências ──────────────────────────────────────────────────────
-- Uma linha por conversa AVALIADA (não só as fechadas): o relatório precisa
-- explicar tanto o que foi contido quanto o que foi poupado, e sem guardar os
-- números que sustentaram a decisão não há como auditar um falso positivo
-- depois. Os campos de evidência são a foto do momento da decisão — não
-- reconsultamos a Helena para reconstruí-los.
create table if not exists openai_containment_actions (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references openai_containment_runs(id) on delete cascade,
  clinic_id      uuid not null references clinics(id) on delete cascade,
  session_id     text not null,              -- id da sessão na Helena
  contact_id     text,
  contact_name   text,
  contact_phone  text,
  -- Decisão: concluída, avaliada e poupada, ou tentativa que falhou na API.
  outcome        text not null
                 check (outcome in ('concluida', 'poupada', 'falhou', 'simulada')),
  reason         text not null,              -- frase pronta para o relatório
  -- Evidências (snapshot da investigação)
  msgs_ia        int not null default 0,
  msgs_paciente  int not null default 0,
  dup_ratio      numeric(5, 4) not null default 0,
  active_hours   int not null default 0,
  chars          bigint not null default 0,
  score          numeric(12, 2) not null default 0,
  last_activity  timestamptz,
  error          text,                       -- preenchido quando outcome='falhou'
  created_at     timestamptz not null default now()
);
create index if not exists openai_containment_actions_run_idx
  on openai_containment_actions (run_id);
create index if not exists openai_containment_actions_clinic_idx
  on openai_containment_actions (clinic_id, created_at desc);
-- Uma conversa não é avaliada duas vezes dentro do mesmo run.
create unique index if not exists openai_containment_actions_run_session
  on openai_containment_actions (run_id, session_id);

-- ── RLS (padrão da casa: leitura/escrita p/ authenticated, nada p/ anon) ─────
alter table openai_containment_runs enable row level security;
revoke all on openai_containment_runs from anon;
grant all on openai_containment_runs to authenticated, service_role;
drop policy if exists openai_containment_runs_auth_all on openai_containment_runs;
create policy openai_containment_runs_auth_all on openai_containment_runs
  for all to authenticated using (true) with check (true);

alter table openai_containment_actions enable row level security;
revoke all on openai_containment_actions from anon;
grant all on openai_containment_actions to authenticated, service_role;
drop policy if exists openai_containment_actions_auth_all on openai_containment_actions;
create policy openai_containment_actions_auth_all on openai_containment_actions
  for all to authenticated using (true) with check (true);
