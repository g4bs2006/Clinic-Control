-- Etapa "Em aprovação" deixa de ser exclusiva das tarefas internas (ADR 0011).
--
-- A 0089 travou `em_aprovacao` em `is_internal = true` porque o ADR 0010 tinha
-- recusado estender a aprovação às tarefas de clínica. O time voltou atrás: o
-- fluxo passa a ser o mesmo para as duas naturezas (pendente → em andamento →
-- em aprovação → concluída, com gestor aprovando), então a constraint de
-- exclusividade sai. `tasks_status_check` (0089) continua valendo — o conjunto
-- de status não muda, só quem pode assumir `em_aprovacao`.
--
-- Sem backfill: nenhuma linha existente tem `em_aprovacao` indevidamente (a
-- constraint garantia isso), e a mudança só ABRE o domínio — código antigo no
-- ar continua funcionando, então a migration pode ser aplicada antes do deploy.
set search_path to clinic_control, public;

alter table tasks drop constraint if exists tasks_em_aprovacao_requires_internal;
