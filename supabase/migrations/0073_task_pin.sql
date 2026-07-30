-- "Fixar" tarefa (pin): colocar em foco no topo da lista.
--
-- Eixo próprio, independente de status/prioridade/prazo — prioridade é o quão
-- importante a tarefa é; fixar é "é NISSO que estou mexendo agora". As fixadas
-- sobem para um bloco "Em foco" no topo da Lista/Minha Semana e continuam
-- visíveis mesmo adiadas (fixar é intenção explícita, vence o snooze).
--
-- Global na tarefa (não por usuário), coerente com snoozed_until/status: cada
-- tarefa já tem um responsável e a carteira não é fronteira entre a equipe.
set search_path to clinic_control, public;

alter table tasks add column if not exists pinned_at timestamptz;

-- As fixadas são poucas — índice parcial só sobre elas.
create index if not exists tasks_pinned_idx on tasks (pinned_at desc) where pinned_at is not null;
