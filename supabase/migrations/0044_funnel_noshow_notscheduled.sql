-- Estende o mapeamento de colunas do funil (0039) com dois buckets novos:
--   noshow_step_ids       → colunas de "faltou" (agendou e não compareceu).
--                           Contam também como agendado (subconjunto, igual ao
--                           fechamento); alimentam o KPI No-show = faltas/agendados.
--   notscheduled_step_ids → colunas de "não agendou" (lead que não chegou a
--                           agendar). NÃO contam como agendado; alimentam a
--                           métrica Não agendados = não-agendados/leads.
-- NULL = sem configuração → fallback canônico por título ("Faltosos" /
-- "Não Agendados"), mantendo o comportamento atual dos painéis padrão.
set search_path to clinic_control, public;

alter table clinic_integrations
  add column if not exists noshow_step_ids       uuid[],
  add column if not exists notscheduled_step_ids uuid[];
