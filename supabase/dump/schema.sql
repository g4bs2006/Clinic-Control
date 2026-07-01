
-- ====== 0001_init.sql ======
create type clinic_mode as enum ('auto', 'manual');
create type contract_status as enum ('active', 'suspended', 'archived');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  state text,            -- UF (2 letras)
  region text,           -- derivada do estado
  lat double precision,
  lng double precision,
  mode clinic_mode not null default 'manual',
  contract_status contract_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table funnel_steps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  counts_as_scheduling boolean not null default false,
  counts_as_closing boolean not null default false
);

create table status_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  rate_min numeric not null,   -- fração 0..1
  rate_max numeric not null,
  color text not null,
  position int not null
);

-- Seed: 9 etapas do funil padrão
insert into funnel_steps (name, position, counts_as_scheduling, counts_as_closing) values
  ('Leads', 1, false, false),
  ('Agendados', 2, true, false),
  ('Não Agendados', 3, false, false),
  ('Reagendados', 4, true, false),
  ('Cancelados', 5, false, false),
  ('Faltosos', 6, false, false),
  ('Orçamento em Aberto', 7, false, false),
  ('Compareceram e Não Fecharam', 8, false, false),
  ('Compareceram e Fecharam', 9, false, true);

-- Seed: faixas de status iniciais (taxa = agendados/leads)
insert into status_rules (label, rate_min, rate_max, color, position) values
  ('Risco Churn', 0.00, 0.05, '#9ca3af', 1),
  ('Preocupante', 0.05, 0.09, '#f97316', 2),
  ('Ok/Atenção',  0.09, 0.11, '#eab308', 3),
  ('Bom',         0.11, 0.13, '#3b82f6', 4),
  ('Ótimo',       0.13, 1.01, '#22c55e', 5);

-- updated_at automático
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger clinics_updated_at before update on clinics
  for each row execute function set_updated_at();

-- ====== 0002_rls.sql ======
-- Row Level Security (RLS)
-- O Supabase expõe as tabelas via PostgREST usando a chave anon (pública, vai
-- para o browser em NEXT_PUBLIC_). Sem RLS, os dados ficariam abertos. Como o
-- sistema é interno, todo usuário autenticado é da equipe Contact e tem acesso
-- total; o papel anon é bloqueado por padrão (RLS nega o que não tem policy).

alter table clinics enable row level security;
alter table funnel_steps enable row level security;
alter table status_rules enable row level security;

-- Defesa em profundidade: remove qualquer privilégio do papel anônimo.
revoke all on clinics from anon;
revoke all on funnel_steps from anon;
revoke all on status_rules from anon;

-- clinics: acesso total para usuários autenticados (equipe interna).
create policy clinics_authenticated_all on clinics
  for all to authenticated using (true) with check (true);

-- funnel_steps: dados de referência — leitura e gestão pela equipe autenticada.
create policy funnel_steps_authenticated_all on funnel_steps
  for all to authenticated using (true) with check (true);

-- status_rules: faixas configuráveis — leitura e gestão pela equipe autenticada.
create policy status_rules_authenticated_all on status_rules
  for all to authenticated using (true) with check (true);

-- ====== 0003_clinic_integrations.sql ======
create table clinic_integrations (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  helena_token_encrypted text not null,   -- iv:tag:ciphertext (AES-256-GCM)
  panel_id uuid not null,
  company_id uuid,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinic_integrations_updated_at before update on clinic_integrations
  for each row execute function set_updated_at();

-- Tabela de CREDENCIAIS: guarda o token cifrado da Helena. Diferente das demais
-- tabelas, NÃO é exposta à superfície do browser. O acesso acontece só no servidor
-- via service_role (que ignora RLS). Por isso revogamos anon E authenticated, e não
-- criamos policy permissiva — com RLS ligado e sem policy, esses papéis são negados.
alter table clinic_integrations enable row level security;
revoke all on clinic_integrations from anon;
revoke all on clinic_integrations from authenticated;
-- Sem policy para anon/authenticated => acesso negado por padrão.
-- O service_role (usado apenas por Server Actions no backend) ignora RLS.

-- ====== 0004_monthly_snapshots.sql ======
create type snapshot_source as enum ('auto', 'manual');

create table monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  year_month text not null,              -- 'YYYY-MM' (UTC)
  leads int not null default 0,
  scheduled int not null default 0,
  rate numeric not null default 0,       -- agendados/leads (fração 0..1)
  status text,                           -- rótulo calculado no congelamento
  status_override text,                  -- sobrescreve o status calculado
  source snapshot_source not null,
  revenue numeric not null default 0,    -- só clínicas auto (faturamento)
  step_counts jsonb,                     -- contagem das 9 etapas (auto)
  frozen boolean not null default false, -- true quando o mês foi congelado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, year_month)
);

create index monthly_snapshots_year_month_idx on monthly_snapshots (year_month);

create trigger monthly_snapshots_updated_at before update on monthly_snapshots
  for each row execute function set_updated_at();

alter table monthly_snapshots enable row level security;
revoke all on monthly_snapshots from anon;
create policy monthly_snapshots_authenticated_all on monthly_snapshots
  for all to authenticated using (true) with check (true);

-- ====== 0005_clinic_agents.sql ======
-- Agentes de IA por clínica + estágios. Origem 'imported'|'edited' sustenta o
-- modo híbrido: o re-import só atualiza linhas ainda 'imported', preservando
-- o que foi editado à mão no app.

create type agent_source as enum ('imported', 'edited');

create table clinic_agents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,              -- nome do agente (ex.: "Sophia")
  unit text,                       -- unidade (quando houver mais de uma)
  persona_md text,                 -- persona em markdown
  source agent_source not null default 'imported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create table agent_stages (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references clinic_agents(id) on delete cascade,
  position int not null,           -- N do estágio (0..)
  slug text not null,              -- ex.: "recepcao"
  name text not null,              -- rótulo legível
  content_md text,                 -- conteúdo do estágio (markdown)
  source agent_source not null default 'imported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, position)
);

create index agent_stages_agent_idx on agent_stages (agent_id);

create trigger clinic_agents_updated_at before update on clinic_agents
  for each row execute function set_updated_at();
create trigger agent_stages_updated_at before update on agent_stages
  for each row execute function set_updated_at();

-- RLS: equipe interna autenticada tem acesso total; anon bloqueado.
alter table clinic_agents enable row level security;
revoke all on clinic_agents from anon;
create policy clinic_agents_authenticated_all on clinic_agents
  for all to authenticated using (true) with check (true);

alter table agent_stages enable row level security;
revoke all on agent_stages from anon;
create policy agent_stages_authenticated_all on agent_stages
  for all to authenticated using (true) with check (true);

-- ====== 0006_clinic_files_storage.sql ======
-- Bucket de arquivos por clínica (privado). Caminho: <clinic_id>/<path relativo>.
-- Acesso só por usuários autenticados (equipe interna) via RLS em storage.objects.

insert into storage.buckets (id, name, public)
values ('clinic-files', 'clinic-files', false)
on conflict (id) do nothing;

create policy "clinic-files authenticated select" on storage.objects
  for select to authenticated using (bucket_id = 'clinic-files');

create policy "clinic-files authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'clinic-files');

create policy "clinic-files authenticated update" on storage.objects
  for update to authenticated using (bucket_id = 'clinic-files')
  with check (bucket_id = 'clinic-files');

create policy "clinic-files authenticated delete" on storage.objects
  for delete to authenticated using (bucket_id = 'clinic-files');

-- ====== 0007_agent_unit_unique.sql ======
-- Uma clínica pode ter o mesmo agente em unidades diferentes (ex.: "Haline" em
-- Tirol e Nova Esperança). A unicidade passa a incluir a unidade (tratando NULL
-- como string vazia, já que UNIQUE ignora NULLs).

alter table clinic_agents drop constraint if exists clinic_agents_clinic_id_name_key;

create unique index if not exists clinic_agents_clinic_name_unit_idx
  on clinic_agents (clinic_id, name, coalesce(unit, ''));

-- ====== 0008_clinic_check_items.sql ======
-- Itens de checkbox configuráveis (catálogo global) e valores por clínica.
-- Os itens são gerenciados em /configuracoes; cada clínica pode marcar/desmarcar.
-- Idempotente: seguro de reaplicar (as tabelas podem já existir em produção).

create table if not exists check_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  position int not null,
  created_at timestamptz not null default now()
);

create table if not exists clinic_checks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  check_item_id uuid not null references check_items(id) on delete cascade,
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (clinic_id, check_item_id)
);

create index if not exists clinic_checks_clinic_idx on clinic_checks (clinic_id);

drop trigger if exists clinic_checks_updated_at on clinic_checks;
create trigger clinic_checks_updated_at before update on clinic_checks
  for each row execute function set_updated_at();

-- RLS: equipe interna autenticada tem acesso total; anon bloqueado.
alter table check_items enable row level security;
revoke all on check_items from anon;
drop policy if exists check_items_authenticated_all on check_items;
create policy check_items_authenticated_all on check_items
  for all to authenticated using (true) with check (true);

alter table clinic_checks enable row level security;
revoke all on clinic_checks from anon;
drop policy if exists clinic_checks_authenticated_all on clinic_checks;
create policy clinic_checks_authenticated_all on clinic_checks
  for all to authenticated using (true) with check (true);

-- ====== 0009_clinic_system.sql ======
-- Sistema/prontuário que a clínica utiliza (ex.: Clinicorp, Google Agenda…).
-- Texto livre validado na aplicação contra a lista em src/lib/clinics/systems.ts.

alter table clinics add column if not exists system text;

-- ====== 0010_whatsapp_groups.sql ======
-- Coleta diaria (18h) das mensagens dos grupos de WhatsApp via Evolution + n8n.
-- Principio: o n8n grava mensagens CRUS; o app calcula o tempo de resposta.
-- Metrica alvo: tempo ate um HUMANO da equipe responder no grupo (bot ignorado).

-- Grupos descobertos pela coleta; clinic_id mapeado manualmente para a clinica dona.
create table if not exists whatsapp_groups (
  group_jid  text primary key,
  clinic_id  uuid references clinics(id) on delete set null,
  name       text,
  instance   text,
  updated_at timestamptz not null default now()
);

-- Mensagens crus dos grupos (1 linha por mensagem).
create table if not exists whatsapp_group_messages (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid references clinics(id) on delete set null,
  instance     text,
  group_jid    text not null,
  message_id   text not null,
  from_me      boolean not null default false,  -- true = conta do bot (a instancia)
  participant  text,                            -- numero de quem enviou (sem @...)
  push_name    text,
  message_type text,
  event_ts     timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (group_jid, message_id)                -- idempotencia da coleta
);
create index if not exists wgm_group_ts_idx  on whatsapp_group_messages (group_jid, event_ts);
create index if not exists wgm_clinic_ts_idx on whatsapp_group_messages (clinic_id, event_ts);

-- Numeros da equipe: separam "equipe" (para o relogio) de "cliente".
-- clinic_id null = numero global (equipe Contact.IA que atende varias clinicas).
create table if not exists whatsapp_team_members (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,   -- so digitos, sem @s.whatsapp.net
  name       text,
  clinic_id  uuid references clinics(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists wtm_phone_clinic_idx
  on whatsapp_team_members (phone, coalesce(clinic_id::text, ''));

-- RLS: equipe interna autenticada tem acesso total; anon bloqueado.
-- (o service_role usado pelo n8n ignora RLS.)
do $$
declare t text;
begin
  foreach t in array array['whatsapp_groups','whatsapp_group_messages','whatsapp_team_members'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists %I_auth_all on %I', t, t);
    execute format('create policy %I_auth_all on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
