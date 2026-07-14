-- Monitor de consumo OpenAI por clínica. Cada clínica é um PROJETO dentro da
-- organização OpenAI da empresa; o vínculo fica em clinics.openai_project_id.
-- O uso diário (tokens + custo em USD) é coletado pela Edge Function
-- collect-openai-usage via Admin API (/organization/usage e /organization/costs)
-- e gravado por (project_id, dia) — SEM clinic_id na linha de uso: o join com a
-- clínica acontece na leitura, então vincular o projeto depois "cura" o
-- histórico já coletado sem backfill.
set search_path to clinic_control, public;

-- ── Vínculo clínica → projeto OpenAI ────────────────────────────────────────
alter table clinics
  add column if not exists openai_project_id text,
  -- Limite diário próprio (US$). Null = usa o limite global de
  -- openai_alert_settings. Clínicas com volume legitimamente alto sobem o teto
  -- aqui sem afrouxar o resto da carteira.
  add column if not exists openai_daily_limit_usd numeric(10, 2);

-- ── Projetos da organização (cache p/ o select de vínculo) ──────────────────
-- Atualizada a cada coleta; evita chamar a OpenAI ao montar a UI.
create table if not exists openai_projects (
  project_id text primary key,          -- "proj_..."
  name       text not null,
  status     text,                      -- active | archived
  synced_at  timestamptz not null default now()
);

-- ── Uso diário por projeto ──────────────────────────────────────────────────
-- Dia em UTC (bucket_width=1d da própria OpenAI — não convertemos fuso para a
-- soma do mês bater com o dashboard deles). Custo separado dos tokens porque
-- vêm de endpoints diferentes; upsert parcial preenche o que chegou.
create table if not exists clinic_openai_usage (
  project_id    text not null,
  day           date not null,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  requests      int    not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (project_id, day)
);
create index if not exists clinic_openai_usage_day_idx on clinic_openai_usage (day desc);

drop trigger if exists clinic_openai_usage_updated_at on clinic_openai_usage;
create trigger clinic_openai_usage_updated_at before update on clinic_openai_usage
  for each row execute function set_updated_at();

-- ── Configuração global dos alertas (linha única, padrão ai_settings) ────────
create table if not exists openai_alert_settings (
  id               boolean primary key default true check (id),
  enabled          boolean not null default true,
  -- Teto absoluto por dia (US$). Clínica pode sobrescrever em
  -- clinics.openai_daily_limit_usd.
  daily_limit_usd  numeric(10, 2) not null default 5,
  -- Anomalia: dia > multiplier × média dos 7 dias anteriores.
  spike_multiplier numeric(4, 1) not null default 2.5,
  -- Piso: dias abaixo disso nunca alertam (evita alarme de centavos quando a
  -- média histórica é ~zero e qualquer uso vira "pico").
  min_cost_usd     numeric(10, 2) not null default 1,
  updated_at       timestamptz not null default now()
);
insert into openai_alert_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists openai_alert_settings_updated_at on openai_alert_settings;
create trigger openai_alert_settings_updated_at before update on openai_alert_settings
  for each row execute function set_updated_at();

-- ── Registro de alertas disparados ──────────────────────────────────────────
-- Uma linha por (projeto, dia, tipo): é o dedup do cron (re-runs no mesmo dia
-- não re-alertam) e a trilha de auditoria. O acompanhamento criado fica
-- referenciado para a UI navegar do alerta à pendência.
create table if not exists openai_usage_alerts (
  id                 uuid primary key default gen_random_uuid(),
  project_id         text not null,
  clinic_id          uuid references clinics(id) on delete set null,
  day                date not null,
  kind               text not null check (kind in ('limite', 'anomalia')),
  cost_usd           numeric(12, 6) not null,
  threshold_usd      numeric(12, 6) not null,  -- limite (ou média×mult) vigente no disparo
  acompanhamento_id  uuid references acompanhamentos(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (project_id, day, kind)
);
create index if not exists openai_usage_alerts_clinic_idx on openai_usage_alerts (clinic_id, created_at desc);

-- ── RLS (padrão da casa: leitura/escrita p/ authenticated, nada p/ anon) ─────
alter table openai_projects enable row level security;
revoke all on openai_projects from anon;
grant all on openai_projects to authenticated, service_role;
drop policy if exists openai_projects_auth_all on openai_projects;
create policy openai_projects_auth_all on openai_projects
  for all to authenticated using (true) with check (true);

alter table clinic_openai_usage enable row level security;
revoke all on clinic_openai_usage from anon;
grant all on clinic_openai_usage to authenticated, service_role;
drop policy if exists clinic_openai_usage_auth_all on clinic_openai_usage;
create policy clinic_openai_usage_auth_all on clinic_openai_usage
  for all to authenticated using (true) with check (true);

alter table openai_alert_settings enable row level security;
revoke all on openai_alert_settings from anon;
grant all on openai_alert_settings to authenticated, service_role;
drop policy if exists openai_alert_settings_auth_all on openai_alert_settings;
create policy openai_alert_settings_auth_all on openai_alert_settings
  for all to authenticated using (true) with check (true);

alter table openai_usage_alerts enable row level security;
revoke all on openai_usage_alerts from anon;
grant all on openai_usage_alerts to authenticated, service_role;
drop policy if exists openai_usage_alerts_auth_all on openai_usage_alerts;
create policy openai_usage_alerts_auth_all on openai_usage_alerts
  for all to authenticated using (true) with check (true);
