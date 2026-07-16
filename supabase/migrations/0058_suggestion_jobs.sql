-- Geração on-demand de sugestões de tarefa (botão "Gerar da IA" em /tarefas)
-- vira job assíncrono com checkpoint, no mesmo padrão dos report_jobs: a UI
-- registra o pedido e segue livre; ticks curtos processam lotes de clínicas.
set search_path to clinic_control, public;

create table if not exists suggestion_jobs (
  id             uuid primary key default gen_random_uuid(),
  requested_by   uuid references app_users(id) on delete set null,
  clinic_ids     uuid[] not null,   -- escopo resolvido no clique (carteira ativa)
  status         text not null default 'queued', -- queued|syncing|analyzing|done|error
  progress_done  int not null default 0,         -- clínicas já analisadas (checkpoint)
  progress_total int not null default 0,
  pending_before int,               -- sugestões pendentes antes (p/ contar as novas)
  stats          jsonb,             -- {summarized, skipped, created, sync_warning, errors[]}
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists suggestion_jobs_requester_idx
  on suggestion_jobs (requested_by, created_at desc);
alter table suggestion_jobs enable row level security;
revoke all on suggestion_jobs from anon;
-- Acesso apenas via service_role (Server Actions/route) — sem policies.
