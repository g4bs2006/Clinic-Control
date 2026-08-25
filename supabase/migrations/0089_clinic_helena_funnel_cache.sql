-- Cache diário do funil Helena por clínica (leads/agendados/taxa/faturamento
-- do mês corrente) — a 0088 resolveu o OVERVIEW (3 chamadas por clínica), mas
-- o funil continuava 100% ao vivo em todo load da home: o mês corrente nunca
-- tem snapshot congelado (ensureFrozen só congela meses passados), então as
-- clínicas automáticas caíam sempre na paginação de cards da Helena — a parte
-- mais cara, e a que ainda deixava a home lenta mesmo com o teto/timeout da
-- 0088.
--
-- Preenchido pela rota /api/helena/funnel-collect, disparada pelo pg_cron
-- abaixo (pg_net, mesmo desenho da 0071/0088): roda NO APP porque precisa
-- decifrar o token Helena de cada clínica.
--
-- A home e o comparativo leem a tabela filtrando por year_month = mês
-- corrente; uma linha do mês anterior (cron ainda não rodou neste mês) não
-- conta como cache válido e cai no fallback ao vivo. O perfil da clínica
-- continua ao vivo (getFunnelForMonth), inclusive para meses passados.
set search_path to clinic_control, public;

create table if not exists clinic_helena_funnel_current (
  clinic_id  uuid primary key references clinics(id) on delete cascade,
  year_month text not null,
  leads      bigint not null default 0,
  scheduled  bigint not null default 0,
  rate       numeric not null default 0,
  revenue    numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists clinic_helena_funnel_current_year_month_idx on clinic_helena_funnel_current (year_month);

alter table clinic_helena_funnel_current enable row level security;
revoke all on clinic_helena_funnel_current from anon;
grant all on clinic_helena_funnel_current to authenticated, service_role;
drop policy if exists clinic_helena_funnel_current_auth_all on clinic_helena_funnel_current;
create policy clinic_helena_funnel_current_auth_all on clinic_helena_funnel_current
  for all to authenticated using (true) with check (true);

-- Cron diário 07:35 BRT (10:35 UTC) — 15 min depois do helena-overviews-collect
-- (07:20 BRT) pra não abrir duas rajadas simultâneas contra a Helena.
do $$
begin
  perform cron.unschedule('helena-funnel-collect');
exception when others then null;  -- ainda não existe
end $$;

do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'collect_groups_cron_secret') then
    perform cron.schedule(
      'helena-funnel-collect',
      '35 10 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
               || '/api/helena/funnel-collect',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_groups_cron_secret')
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  else
    raise warning 'helena-funnel-collect NÃO agendado: falta o secret collect_groups_cron_secret no Vault';
  end if;
end $$;
