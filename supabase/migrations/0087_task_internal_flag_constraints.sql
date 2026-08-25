-- Tarefas internas × tarefas das clínicas (ADR 0009) — FASE 2 DE 2.
--
-- Aplicar DEPOIS que o código que escreve is_internal estiver no ar (merge +
-- deploy). Antes disso, tarefas sem clínica criadas pelo código antigo podem
-- ter nascido com is_internal=false — o UPDATE abaixo corrige o intervalo e só
-- então as constraints entram, travando o espelho de vez.
--
-- is_internal é uma flag EXPLÍCITA, mantida em espelho com clinic_id por duas
-- CHECK constraints: interna ⇔ sem clínica; tarefa de clínica ⇔ com clínica.
-- Se um dia "interna com contexto de clínica" for pedida, a evolução é dropar
-- tasks_internal_requires_no_clinic — porta de saída registrada no ADR.
set search_path to clinic_control, public;

-- Re-fix: linhas do intervalo entre a 0086 e o deploy do código novo.
update tasks set is_internal = true where clinic_id is null;

alter table tasks add constraint tasks_internal_requires_no_clinic
  check (not is_internal or clinic_id is null);
alter table tasks add constraint tasks_clinic_requires_clinic
  check (is_internal or clinic_id is not null);
