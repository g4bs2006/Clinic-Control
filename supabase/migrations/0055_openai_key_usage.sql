-- Monitor OpenAI v2: granularidade por API KEY, não por projeto. A organização
-- real tem só 2 projetos (tudo concentrado no "I.A. Fluxodonto"), mas cada
-- clínica tem a própria API key dentro dele — a key vira o identificador da
-- clínica. Tokens por key vêm de /organization/usage/completions com
-- group_by=api_key_id,model; o custo por key é ESTIMADO (tokens × preço por
-- modelo) e calibrado para o total do dia bater com o custo real do endpoint
-- /organization/costs (que só quebra por projeto). As tabelas por projeto da
-- 0053 continuam alimentadas: são o custo real agregado e a base da calibração.
set search_path to clinic_control, public;

-- ── Vínculo clínica → API key OpenAI ────────────────────────────────────────
-- openai_project_id (0053) fica órfão mas não é removido: histórico/rollback.
alter table clinics
  add column if not exists openai_api_key_id text;

-- ── API keys da organização (cache p/ o select de vínculo) ──────────────────
create table if not exists openai_api_keys (
  api_key_id     text primary key,     -- "key_..."
  name           text not null,        -- nome dado na OpenAI (geralmente a clínica)
  redacted_value text,                 -- "sk-proj-****...abcd" p/ conferência visual
  project_id     text,                 -- projeto dono da key
  synced_at      timestamptz not null default now()
);

-- ── Uso diário por key × modelo ─────────────────────────────────────────────
-- Modelo na PK porque o preço varia por modelo; a leitura soma por (key, dia).
-- est_cost_usd = estimativa calibrada (ver cabeçalho).
create table if not exists openai_key_usage (
  api_key_id    text not null,
  day           date not null,
  model         text not null default '',
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  requests      int    not null default 0,
  est_cost_usd  numeric(12, 6) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (api_key_id, day, model)
);
create index if not exists openai_key_usage_day_idx on openai_key_usage (day desc);

drop trigger if exists openai_key_usage_updated_at on openai_key_usage;
create trigger openai_key_usage_updated_at before update on openai_key_usage
  for each row execute function set_updated_at();

-- ── Alertas por key ─────────────────────────────────────────────────────────
-- project_id vira opcional; alertas novos carregam api_key_id. O unique parcial
-- reproduz o dedup (projeto, dia, tipo) da 0053 para o mundo por key.
alter table openai_usage_alerts
  add column if not exists api_key_id text,
  alter column project_id drop not null;
create unique index if not exists openai_usage_alerts_key_day_kind
  on openai_usage_alerts (api_key_id, day, kind) where api_key_id is not null;

-- ── RLS (padrão da casa: leitura/escrita p/ authenticated, nada p/ anon) ─────
alter table openai_api_keys enable row level security;
revoke all on openai_api_keys from anon;
grant all on openai_api_keys to authenticated, service_role;
drop policy if exists openai_api_keys_auth_all on openai_api_keys;
create policy openai_api_keys_auth_all on openai_api_keys
  for all to authenticated using (true) with check (true);

alter table openai_key_usage enable row level security;
revoke all on openai_key_usage from anon;
grant all on openai_key_usage to authenticated, service_role;
drop policy if exists openai_key_usage_auth_all on openai_key_usage;
create policy openai_key_usage_auth_all on openai_key_usage
  for all to authenticated using (true) with check (true);
