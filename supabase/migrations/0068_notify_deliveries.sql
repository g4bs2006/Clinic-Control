-- Observabilidade do envio ao grupo de WhatsApp.
--
-- Até aqui uma falha de envio era invisível: a notify devolve HTTP 200 mesmo
-- quando nenhum destinatário recebeu (o erro vai só no corpo JSON), e o único
-- registro era net._http_response, que o pg_net descarta em ~6h. Resultado
-- prático: o envio ficou quebrado de 09/07 a 28/07/2026 sem ninguém notar, e
-- na investigação não havia como responder "desde quando".
--
-- Duas peças aqui:
--   1. notify_deliveries — histórico de toda tentativa de envio;
--   2. coluna channel em evolution_health_checks — o health check passa a olhar
--      TAMBÉM a instância de envio (NOTIFY_*), não só a de leitura. O bug de
--      2026-07-28 (secrets apontando para um servidor Evolution antigo) teria
--      sido pego na primeira hora por essa checagem.
--
-- O alerta em si não sai por WhatsApp — sairia justamente pelo canal quebrado.
-- Vai para o sino in-app (notifications, 0062), via health-evolution.
set search_path to clinic_control, public;

-- ── Histórico de entregas ────────────────────────────────────────────────────
create table if not exists notify_deliveries (
  id         uuid primary key default gen_random_uuid(),
  -- manha | noite | contencao — mesmo ?type= da Edge Function.
  type       text not null,
  -- true só quando TODOS os destinatários receberam.
  ok         boolean not null,
  recipients int not null default 0,
  -- Erros concatenados (um por destinatário que falhou), truncados.
  error      text,
  created_at timestamptz not null default now()
);
-- Consulta quente: "qual a última entrega bem-sucedida?" — usada pelo health
-- check de hora em hora e pela faixa de status na UI.
create index if not exists notify_deliveries_ok_created_idx
  on notify_deliveries (created_at desc) where ok;
create index if not exists notify_deliveries_created_idx
  on notify_deliveries (created_at desc);

alter table notify_deliveries enable row level security;
revoke all on notify_deliveries from anon;
grant all on notify_deliveries to authenticated, service_role;
drop policy if exists notify_deliveries_auth_all on notify_deliveries;
create policy notify_deliveries_auth_all on notify_deliveries
  for all to authenticated using (true) with check (true);

-- ── Health check por canal ───────────────────────────────────────────────────
-- 'leitura' = instância EVOLUTION_* (collect-groups); 'envio' = NOTIFY_*.
-- Default 'leitura' preserva o histórico já gravado, que era todo de leitura.
alter table evolution_health_checks
  add column if not exists channel text not null default 'leitura'
  check (channel in ('leitura', 'envio'));

-- O app pergunta sempre "último check DESTE canal": sem o channel no índice,
-- a busca varre as linhas do outro canal intercaladas.
create index if not exists evolution_health_checks_channel_idx
  on evolution_health_checks (channel, checked_at desc);
