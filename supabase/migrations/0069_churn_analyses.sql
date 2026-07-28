-- Post-mortem de churn por IA.
--
-- Ao registrar um desligamento, a conversa do grupo daquela clínica é lida dos
-- últimos meses e vira uma análise: motivos prováveis, sinais que apareceram
-- antes e trechos que sustentam cada conclusão. O objetivo é responder "o que
-- deu errado" com evidência do que foi realmente dito, não com a memória de
-- quem preencheu o formulário — o campo `reason` é uma lista fechada e o
-- `notes` costuma vir vazio.
--
-- Roda numa Edge Function (churn-postmortem) porque a chave do LLM
-- (DEEPSEEK_API_KEY) só existe no Supabase, como no summarize-groups.
--
-- Uma análise por churn: o unique em churn_id deixa o "Analisar de novo" ser um
-- upsert em vez de empilhar versões.
set search_path to clinic_control, public;

create table if not exists churn_analyses (
  id            uuid primary key default gen_random_uuid(),
  churn_id      uuid not null unique references clinic_churns(id) on delete cascade,
  clinic_id     uuid not null references clinics(id) on delete cascade,
  status        text not null default 'rodando'
                check (status in ('rodando', 'concluido', 'erro')),
  -- Janela lida (dias) e quantas mensagens entraram de fato no prompt: sem
  -- isso não dá para saber se uma análise pobre é do modelo ou de falta de dado.
  window_days   int not null default 120,
  messages_used int not null default 0,
  -- true quando o volume estourou o teto e mensagens antigas foram cortadas.
  truncated     boolean not null default false,
  model         text,
  -- Texto corrido para leitura humana.
  summary       text,
  -- [{ motivo, confianca, evidencia }] — motivos prováveis, do mais forte ao mais fraco.
  reasons       jsonb not null default '[]'::jsonb,
  -- [{ quando, sinal }] — o que já apontava para o churn antes de acontecer.
  signals       jsonb not null default '[]'::jsonb,
  -- Frases citadas do grupo, para auditar a conclusão do modelo.
  quotes        jsonb not null default '[]'::jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists churn_analyses_clinic_idx on churn_analyses (clinic_id);

drop trigger if exists churn_analyses_updated_at on churn_analyses;
create trigger churn_analyses_updated_at before update on churn_analyses
  for each row execute function set_updated_at();

alter table churn_analyses enable row level security;
revoke all on churn_analyses from anon;
grant all on churn_analyses to authenticated, service_role;
drop policy if exists churn_analyses_auth_all on churn_analyses;
create policy churn_analyses_auth_all on churn_analyses
  for all to authenticated using (true) with check (true);
