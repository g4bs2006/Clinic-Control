-- Cache diário do overview Helena por clínica (contatos/canais/status) — a
-- home lia isso AO VIVO (3 chamadas à Helena por clínica a cada load, sem teto
-- de concorrência), o que deixava a página lenta na primeira visita do dia.
--
-- Preenchido pela rota /api/helena/overviews-collect, disparada pelo pg_cron
-- abaixo (pg_net, mesmo desenho da 0071): roda NO APP, não numa Edge Function,
-- porque precisa decifrar o token Helena de cada clínica e a chave
-- (HELENA_TOKEN_ENC_KEY) vive no ambiente do app.
--
-- A home lê a tabela inteira numa query; o perfil da clínica continua ao vivo
-- (getHelenaAccountOverview), e clínicas ainda sem linha caem no vivo também.
set search_path to clinic_control, public;

create table if not exists clinic_helena_overview (
  clinic_id      uuid primary key references clinics(id) on delete cascade,
  contact_count  bigint,
  company_status text,           -- PRODUCTION, SUBSCRIPTION_SUSPENDED, ...
  setup_status   text,
  channels       jsonb not null default '[]'::jsonb,
  updated_at     timestamptz not null default now()
);
create index if not exists clinic_helena_overview_updated_idx on clinic_helena_overview (updated_at);

alter table clinic_helena_overview enable row level security;
revoke all on clinic_helena_overview from anon;
grant all on clinic_helena_overview to authenticated, service_role;
drop policy if exists clinic_helena_overview_auth_all on clinic_helena_overview;
create policy clinic_helena_overview_auth_all on clinic_helena_overview
  for all to authenticated using (true) with check (true);

-- Cron diário 07:20 BRT (10:20 UTC): uma execução cobre a carteira inteira em
-- rajadas de 6 — cabe folgado no orçamento de 300s da rota.
do $$
begin
  perform cron.unschedule('helena-overviews-collect');
exception when others then null;  -- ainda não existe
end $$;

do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'collect_groups_cron_secret') then
    perform cron.schedule(
      'helena-overviews-collect',
      '20 10 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
               || '/api/helena/overviews-collect',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_groups_cron_secret')
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  else
    raise warning 'helena-overviews-collect NÃO agendado: falta o secret collect_groups_cron_secret no Vault';
  end if;
end $$;
