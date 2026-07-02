-- Health check horário da instância Evolution (pg_cron → Edge Function health-evolution).
-- Motivação: em 01/07/2026 a instância caiu e as mensagens do período se perderam
-- de vez (a Evolution descarta o histórico recente ao reconectar). Monitorar a
-- conexão permite agir antes de perder um dia inteiro.
create table if not exists evolution_health_checks (
  id         uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  state      text,                 -- open | connecting | close | erro http
  ok         boolean not null default false
);
create index if not exists ehc_checked_idx on evolution_health_checks (checked_at desc);

alter table evolution_health_checks enable row level security;
grant all on evolution_health_checks to authenticated, service_role;
revoke all on evolution_health_checks from anon;
drop policy if exists evolution_health_checks_auth_all on evolution_health_checks;
create policy evolution_health_checks_auth_all on evolution_health_checks
  for all to authenticated using (true) with check (true);
