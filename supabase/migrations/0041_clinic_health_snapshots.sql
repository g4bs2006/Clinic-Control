-- Snapshot diário do health score por clínica. Computado sob demanda (lazy): no
-- primeiro acesso do dia à carteira, o app calcula e grava uma linha por clínica.
-- Guardar o histórico permite o "o que mudou desde ontem" (delta de score/banda)
-- na tela de início. Score/band/confidence ficam null quando o status é
-- 'insuficiente' (cobertura de sinais baixa — ver src/lib/health/score.ts).
set search_path to clinic_control, public;

create table if not exists clinic_health_snapshots (
  clinic_id     uuid not null references clinics(id) on delete cascade,
  snapshot_date date not null,
  status        text not null,            -- 'scored' | 'insuficiente'
  score         int,                      -- 0..100 (null se insuficiente)
  band          text,                     -- 'saudavel' | 'atencao' | 'risco' | null
  confidence    text,                     -- 'alta' | 'media' | 'baixa' | null
  coverage      numeric not null default 0,
  factors       jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  primary key (clinic_id, snapshot_date)
);

create index if not exists clinic_health_snapshots_date_idx
  on clinic_health_snapshots (snapshot_date);

alter table clinic_health_snapshots enable row level security;
revoke all on clinic_health_snapshots from anon;
grant all on clinic_health_snapshots to authenticated, service_role;
drop policy if exists clinic_health_snapshots_auth_all on clinic_health_snapshots;
create policy clinic_health_snapshots_auth_all on clinic_health_snapshots
  for all to authenticated using (true) with check (true);
