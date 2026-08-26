-- Etapa "Em aprovação" no fluxo de tarefas internas (ADR 0010).
--
-- Novo status entre "em andamento" e "concluída", só para tarefas internas
-- (gestor revisa antes de dar por encerrado). Tarefas de clínica não usam
-- esse status — o código nunca produz `em_aprovacao` numa tarefa de clínica,
-- e a constraint abaixo trava isso no banco também, no mesmo espírito das
-- constraints de espelho do ADR 0009 (tasks_internal_requires_no_clinic).
set search_path to clinic_control, public;

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('pendente', 'em_andamento', 'em_aprovacao', 'concluida', 'cancelada'));

alter table tasks add constraint tasks_em_aprovacao_requires_internal
  check (status <> 'em_aprovacao' or is_internal);
