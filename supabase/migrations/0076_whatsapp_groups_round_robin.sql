-- Segunda parte do fix da coleta (ver 0075 para a primeira).
--
-- Medição do `?probe=1` na Evolution de produção (2026-08-17):
--   - fetchAllGroups .............. ~12s
--   - findMessages (1 página) ..... ~3,4s por grupo, custo FIXO (payload de
--     88KB levou 6,1s; o de 621KB levou 4,5s — é tempo de query, não de rede)
--   - 8 grupos sequencial 27,2s vs 20,4s em paralelo → a Evolution SERIALIZA,
--     subir a concorrência não compra quase nada.
--
-- Logo: 81 grupos × 3,4s ≈ 275s + 12s ≈ 287s, contra um limite de execução de
-- 200s da Edge Function. O trabalho de uma coleta completa NÃO CABE em uma
-- execução — e como a função só gravava no fim, ser morta aos 200s zerava
-- tudo. Foi isso que deixou a coleta 7 dias sem inserir uma linha (e, por
-- tabela, parou os resumos diários e a geração de tarefas por IA).
--
-- Fix: a função passa a gravar por lote, respeitar um deadline próprio e
-- varrer os grupos em round-robin — cada execução continua de onde a anterior
-- parou, e as 4 execuções diárias do cron cobrem os 81 grupos com folga.
-- `last_collected_at` é o cursor desse rodízio (nulo = nunca coletado, tem
-- prioridade).
set search_path to clinic_control, public;

alter table whatsapp_groups
  add column if not exists last_collected_at timestamptz;

-- Ordem do rodízio: nunca-coletados primeiro, depois os mais antigos.
create index if not exists whatsapp_groups_round_robin_idx
  on whatsapp_groups (last_collected_at nulls first);
