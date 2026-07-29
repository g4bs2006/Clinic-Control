-- Configuração da AUTOMAÇÃO DE AGENDAMENTO por clínica.
--
-- Contexto: essa configuração já existia, mas fora do Clinic Control — numa
-- tabela `public.automacao_clinicas` mantida à mão e lida pelo n8n. Mesmo banco,
-- schema diferente. O resultado foi modelagem duplicada (panel_id e token nas
-- duas) e divergência silenciosa: em 2026-07-29 havia 2 linhas com o `nome` de
-- outra clínica (copiadas e não renomeadas), o panel_id da Biosorriso diferente
-- do que o app usa, e 18 das 21 linhas sem os campos que a automação nova pede.
--
-- A partir daqui o clinic_control é a FONTE DA VERDADE e a tabela do `public`
-- vira uma PROJEÇÃO escrita pelo app (ver lib/clinics/automation-projection.ts).
-- Os workflows do n8n continuam lendo o que sempre leram, sem alteração.
--
-- Por que campos novos e não reuso do mapeamento de funil que já existe:
-- `scheduled_step_ids` (plural) é conjunto de LEITURA — "quais colunas contam
-- como agendado" na métrica. `automation_scheduled_step_id` (singular) é destino
-- de ESCRITA — para qual coluna a automação move o card. São coisas diferentes
-- e fundi-las quebraria uma das duas. O app cruza as duas e avisa quando o
-- destino de escrita não está no conjunto de leitura (ninguém checava isso).
set search_path to clinic_control, public;

alter table clinic_integrations
  -- Liga/desliga a automação para a clínica (= `ativo` na projeção).
  add column if not exists automation_enabled boolean not null default false,

  -- Etapas do painel usadas pela automação (uma cada, destino de escrita).
  add column if not exists automation_lead_step_id      uuid,  -- coluna de chegada  (step_id)
  add column if not exists automation_scheduled_step_id uuid,  -- destino "agendado" (agendado_step_id)
  add column if not exists automation_cancelled_step_id uuid,  -- destino "cancelado"(cancelado_step_id)

  -- Etiqueta de CARD que marca "agendado pela IA" (ia_card_tag_id) e etiqueta de
  -- CONTATO que marca o mesmo no contato (agendado_contact_tag_id). São dois
  -- catálogos distintos na Helena: card vem do painel (IncludeDetails=Tags),
  -- contato vem de GET /core/v1/tag.
  add column if not exists automation_ia_card_tag_id           uuid,
  add column if not exists automation_scheduled_contact_tag_id uuid,

  -- Campos personalizados do painel onde a automação grava as datas. Aqui o
  -- identificador é a `key` do campo (string), não uuid.
  add column if not exists automation_scheduled_at_field_key  text, -- "Agendado em"
  add column if not exists automation_scheduled_for_field_key text, -- "Agendado para"

  -- Origem do lead: cada uma tem etiqueta de card E de contato.
  add column if not exists automation_fb_panel_tag_id    uuid,
  add column if not exists automation_fb_contact_tag_id  uuid,
  add column if not exists automation_ig_panel_tag_id    uuid,
  add column if not exists automation_ig_contact_tag_id  uuid,
  add column if not exists automation_org_panel_tag_id   uuid,
  add column if not exists automation_org_contact_tag_id uuid,

  -- Diagnóstico da última detecção. Substitui o `status_obs` (que era uma string
  -- concatenada com " | ") por dado estruturado que a UI consegue listar.
  add column if not exists automation_warnings    text[],
  add column if not exists automation_detected_at timestamptz;

-- Detecção em lote da carteira, com checkpoint — mesmo padrão de report_jobs e
-- suggestion_jobs: a UI registra o pedido e segue livre, ticks curtos processam
-- lotes de clínicas (cada clínica são ~4 chamadas à API da Helena).
create table if not exists automation_jobs (
  id             uuid primary key default gen_random_uuid(),
  requested_by   uuid references app_users(id) on delete set null,
  clinic_ids     uuid[] not null,   -- escopo resolvido no clique (carteira ativa)
  status         text not null default 'queued', -- queued|running|done|error
  progress_done  int not null default 0,         -- clínicas já varridas (checkpoint)
  progress_total int not null default 0,
  -- Se true, grava o resultado da detecção nos campos AINDA VAZIOS (nunca
  -- sobrescreve escolha humana). Se false, só recolhe os avisos.
  apply_empty    boolean not null default true,
  stats          jsonb,             -- {detected, applied, incomplete, errors[]}
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists automation_jobs_requester_idx
  on automation_jobs (requested_by, created_at desc);

alter table automation_jobs enable row level security;
revoke all on automation_jobs from anon;
-- Acesso apenas via service_role (Server Actions/route) — sem policies, igual
-- aos outros jobs. clinic_integrations já é service-role-only por ser credencial.

drop trigger if exists automation_jobs_updated_at on automation_jobs;
create trigger automation_jobs_updated_at before update on automation_jobs
  for each row execute function set_updated_at();
