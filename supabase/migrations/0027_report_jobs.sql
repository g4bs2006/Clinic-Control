-- Relatório de conversas (análise IA via WTS/Helena) — fase 1.
-- Jobs assíncronos com checkpoint, staging do bruto coletado e keywords do
-- funil E0-E8 (seed = script SPIN da COLT; ajustável em /configuracoes).
set search_path to clinic_control, public;

-- ── Keywords por estágio (padrão global) ────────────────────────────────────
create table if not exists report_keywords (
  stage      text primary key,  -- E1..E8, E5_TENTOU, E5_AGENDOU, E5_PEDIU_DADOS, E5_VALIDANDO
  terms      text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table report_keywords enable row level security;
revoke all on report_keywords from anon;

insert into report_keywords (stage, terms) values
  ('E1', array['primeira vez','já é nosso paciente','com quem eu falo','como posso te chamar','tudo bem','olá','ola','oi tudo','que bom ter você','bem-vindo']),
  ('E2', array['o que mais te incomoda','mastigar','mastigação','mastigacao','vergonha de sorrir','aparência dos dentes','falta de dentes','dificuldade para comer','o que te trouxe','qual o seu interesse','me conta','dificuldade','incômodo','incomodo','estética','dentes']),
  ('E3', array['adiar','só piora','so piora','piora','jantar com amigos','fotos de família','aproveitar a vida','entendo como','entendo perfeitamente','muitos pacientes chegam','impede','limita','prejudica','poxa']),
  ('E4', array['agenda dela é muito disputada','agenda da clínica é muito disputada','vaga prioritária','prioridade','avaliação','avaliacao','especialista','direito de sorrir','tenta imaginar','daqui a uns dias','minha palavra','se eu conseguisse','você me daria','sua palavra']),
  ('E5_TENTOU', array['agenda da clínica','separei as duas melhores','opção 1','opcao 1','opção 2','opcao 2','🗓','qual fica melhor','horário disponível','verificar_disponibilidade','vagas que surgiram','melhores vagas','horario','horário','data disponível']),
  ('E5_AGENDOU', array['agendamento confirmado','confirmado com sucesso','ficou agendado','ficou marcado','sua consulta','agendado pela ia','te esperamos','estamos te esperando','vaga confirmada','agendado com sucesso','agendamento realizado']),
  ('E5_PEDIU_DADOS', array['nome completo','data de nascimento','cpf','pra confirmar','para confirmar','também envie','tambem envie','completar o cadastro','pra completar','me manda seu nome','me envia seu nome','seus dados','seu nome completo','envie seu nome']),
  ('E5_VALIDANDO', array['realizar_agendamento','realizando o agend','processando','verificando os seus dados','verificar os dados','verificando os dados','um momento','já estou realizando','estou realizando','analisando os dados','vou confirmar']),
  ('E6', array['clínica agradece','transformar seu sorriso','ficou mais alguma dúvida','finalizar atendimento','tchau','até mais','obrigada pela confiança','até logo','ate logo']),
  ('E7', array['transferir_atendimento','transferindo para','passar seu contato','vou passar para','instabilidade','transferir','passar o bastão']),
  ('E8', array['melhoria_banco_conhecimento','banco de conhecimento','confirmar esse detalhe','assessoria da clínica','informação imprecisa','excelente pergunta'])
on conflict (stage) do nothing;

-- ── Jobs de relatório ────────────────────────────────────────────────────────
create table if not exists report_jobs (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  date_start     date not null,
  date_end       date not null,
  status         text not null default 'queued', -- queued|collecting|analyzing|done|error
  progress_done  int not null default 0,
  progress_total int,
  file_path      text,           -- caminho no bucket 'reports' quando done
  stats          jsonb,          -- resumo pós-análise (totais, taxa, funil)
  error          text,
  requested_by   uuid references app_users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists report_jobs_clinic_idx on report_jobs (clinic_id, created_at desc);
alter table report_jobs enable row level security;
revoke all on report_jobs from anon;

-- ── Staging do bruto coletado (sessão + mensagens + contato) ────────────────
-- Chaveado por clínica+sessão (não por job): regerar um relatório do mesmo
-- período reaproveita o que já foi coletado, sem re-chamar a API.
create table if not exists report_raw_sessions (
  clinic_id          uuid not null references clinics(id) on delete cascade,
  session_id         text not null,
  session_created_at timestamptz not null,
  payload            jsonb not null,  -- { session, messages[], contact }
  collected_at       timestamptz not null default now(),
  primary key (clinic_id, session_id)
);
create index if not exists report_raw_sessions_period_idx
  on report_raw_sessions (clinic_id, session_created_at);
alter table report_raw_sessions enable row level security;
revoke all on report_raw_sessions from anon;

-- ── Bucket dos xlsx gerados ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
-- Acesso apenas via service_role (Server Actions) — sem policies para anon/authenticated.
