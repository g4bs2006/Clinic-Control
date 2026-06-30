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
