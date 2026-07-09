-- Mapeamento dinâmico das colunas do funil por clínica. Até aqui a
-- classificação de "lead / agendado / fechamento" era feita por TÍTULO de
-- etapa (constantes canônicas hardcoded em src/lib/helena/funnel.ts), o que
-- deixava de fora painéis com colunas nomeadas de outro jeito. Agora o gestor
-- escolhe, por clínica, quais steps (colunas do painel Helena) correspondem a
-- cada bucket. Os ids são os UUIDs das etapas retornadas por getPanelWithSteps.
--
-- Semântica das colunas:
--   lead_step_ids      → colunas de "chegada de leads" (informativo/rotulagem;
--                        leads continua = todos os cards do painel).
--   scheduled_step_ids → colunas que contam como "agendado".
--   closing_step_ids   → colunas de "fechamento/faturamento"; revenue = soma do
--                        monetaryAmount dos cards nessas colunas.
--
-- Todas NULL por padrão. NULL = clínica sem mapeamento → fallback no
-- comportamento canônico atual (por título). Aplica-se só do mês corrente em
-- diante; snapshots já congelados não são recalculados.
set search_path to clinic_control, public;

alter table clinic_integrations
  add column if not exists lead_step_ids      uuid[],
  add column if not exists scheduled_step_ids uuid[],
  add column if not exists closing_step_ids   uuid[];
