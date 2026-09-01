-- Tokens de API pessoais para integrações externas (ex.: Agents Planner).
-- Substitui o modelo de segredo global único (AGENTS_PLANNER_API_SECRET):
-- cada token pertence a um app_users e, na verificação (src/lib/tokens/verify.ts),
-- escopa a chamada só às clínicas do developer_id do dono — nunca a carteira
-- inteira, mesmo que o dono seja gestor.
set search_path to clinic_control, public;

create table if not exists api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_users(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique, -- sha256 hex do token completo
  token_prefix text not null,        -- primeiros chars, só para exibição na lista
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists api_tokens_user_idx on api_tokens (user_id);
