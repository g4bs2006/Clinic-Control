-- Completa o mapeamento de colunas do funil com o bucket de comparecimento:
--   attended_step_ids → colunas de "compareceu" (veio à consulta). Subconjunto
--   de agendado (quem compareceu agendou); as colunas de fechamento contam
--   automaticamente como compareceu (quem fechou compareceu).
-- Com isso os 3 KPIs derivados (Comparecimento, Fechamento, No-show) passam a
-- funcionar em painéis mapeados: comparecimento = compareceu/agendados,
-- fechamento = fechados/compareceu (contagem; o faturamento continua sendo a
-- soma do monetaryAmount dos cards nas colunas de fechamento).
-- NULL = fallback canônico ("Compareceram e Não Fecharam"/"Compareceram e Fecharam").
set search_path to clinic_control, public;

alter table clinic_integrations
  add column if not exists attended_step_ids uuid[];
