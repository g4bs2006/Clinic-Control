-- Tarefas recorrentes (Fase 1) + memória do detector de rotinas (Fase 2).
--
-- A regra é uma ENTIDADE própria (não uma tarefa que se clona): editar a série,
-- pausar e o fan-out por carteira têm um lugar óbvio. As ocorrências nascem em
-- tasks com recurrence_id/recurrence_date; a materialização é SOB DEMANDA (na
-- abertura de /tarefas ou do dashboard), por calendário com ANTI-EMPILHAMENTO:
-- na data devida, se a ocorrência anterior da regra (mesma clínica) segue
-- aberta, não cria duplicata. Idempotência garantida pelo índice único
-- (regra, data, clínica) — corridas entre aberturas simultâneas caem em 23505.
set search_path to clinic_control, public;

create table if not exists task_recurrences (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category    text not null default 'outro' references task_categories(slug) on update cascade,
  priority    text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  -- Frequência: diária; semanal (weekday 0=domingo…6=sábado); mensal (monthday
  -- 1..31, ajustado para o último dia em meses curtos).
  freq        text not null check (freq in ('diaria', 'semanal', 'mensal')),
  weekday     int check (weekday between 0 and 6),
  monthday    int check (monthday between 1 and 31),
  -- Escopo: clinic_id = regra de UMA clínica; all_clinics = fan-out para todas
  -- as clínicas ativas (uma tarefa por clínica, responsável = dev da carteira);
  -- ambos nulos/false = tarefa interna.
  clinic_id   uuid references clinics(id) on delete cascade,
  all_clinics boolean not null default false,
  -- Responsável fixo (regras sem fan-out). No fan-out o responsável é o dev da
  -- clínica, com fallback neste campo e por fim no criador.
  assigned_to uuid references app_users(id) on delete set null,
  active      boolean not null default true,
  created_by  uuid references app_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists task_recurrences_updated_at on task_recurrences;
create trigger task_recurrences_updated_at before update on task_recurrences
  for each row execute function set_updated_at();

alter table tasks
  add column if not exists recurrence_id   uuid references task_recurrences(id) on delete set null,
  add column if not exists recurrence_date date;

-- Uma ocorrência por (regra, data, clínica) — clinic_id null vira UUID zero no
-- índice para a unicidade valer também nas regras internas.
create unique index if not exists tasks_recurrence_occurrence_key
  on tasks (recurrence_id, recurrence_date, coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where recurrence_id is not null;

-- ── Detector de rotinas: memória de rejeição ────────────────────────────────
-- signature = clinic_id (ou 'interna') + título normalizado do cluster.
-- Cluster ignorado não volta a ser sugerido.
create table if not exists recurrence_dismissals (
  id           uuid primary key default gen_random_uuid(),
  signature    text not null unique,
  dismissed_by uuid references app_users(id) on delete set null,
  dismissed_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['task_recurrences','recurrence_dismissals'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant all on %I to authenticated, service_role', t);
    execute format('drop policy if exists %I_auth_all on %I', t, t);
    execute format('create policy %I_auth_all on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
