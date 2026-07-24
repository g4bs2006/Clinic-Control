-- "Adiar" tarefa (snooze): esconder da vista até uma data, sem mexer no prazo.
-- Eixo separado do due_date — due_date = quando vence; snoozed_until = a partir
-- de quando quero ver de novo. A lista/Minha Semana escondem tarefas com
-- snoozed_until no futuro (comparado ao "hoje" em America/Sao_Paulo) e elas
-- reaparecem sozinhas na data. Adiamento é global na tarefa (não por usuário),
-- coerente com status/prioridade.
set search_path to clinic_control, public;

alter table tasks add column if not exists snoozed_until date;

-- Filtra rápido as "adiadas ainda no futuro" nas listagens.
create index if not exists tasks_snoozed_idx on tasks (snoozed_until);
