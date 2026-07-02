-- Resumo diário por IA do que aconteceu no grupo de cada clínica.
-- Gerado pela Edge Function summarize-groups (pg_cron ~18h45 BRT, após a coleta).
create table if not exists whatsapp_daily_summaries (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  summary_date  date not null,              -- dia resumido (fuso America/Sao_Paulo)
  summary_md    text not null,              -- resumo em markdown
  highlights    jsonb,                      -- { temas[], pendencias[], reclamacoes[], sentimento, risco_churn }
  model         text,                       -- ex.: deepseek-chat
  message_count int not null default 0,     -- mensagens com texto consideradas
  created_at    timestamptz not null default now(),
  unique (clinic_id, summary_date)
);
create index if not exists wds_clinic_date_idx on whatsapp_daily_summaries (clinic_id, summary_date desc);
create index if not exists wds_date_idx on whatsapp_daily_summaries (summary_date desc);

alter table whatsapp_daily_summaries enable row level security;
grant all on whatsapp_daily_summaries to authenticated;
revoke all on whatsapp_daily_summaries from anon;
drop policy if exists whatsapp_daily_summaries_auth_all on whatsapp_daily_summaries;
create policy whatsapp_daily_summaries_auth_all on whatsapp_daily_summaries
  for all to authenticated using (true) with check (true);
