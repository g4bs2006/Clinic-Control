-- Tarefas internas × tarefas das clínicas (ADR 0009) — FASE 1 DE 2.
--
-- Esta migration só ADICIONA a coluna e faz o backfill — é segura de aplicar a
-- qualquer momento, com o código antigo ou novo no ar: o código antigo não
-- escreve o campo (usa o default false) e o código novo escreve sem depender
-- de constraint nenhuma.
--
-- As CHECK constraints que garantem o espelho (interna ⇔ sem clínica) vêm na
-- 0087, DEPOIS do deploy do código que escreve is_internal — na ordem inversa
-- o código antigo quebraria ao criar tarefa sem clínica (INSERT clinic_id null
-- + is_internal default false) e o código novo quebraria antes de a coluna
-- existir.
set search_path to clinic_control, public;

alter table tasks add column is_internal boolean not null default false;

-- Backfill: tudo que já era "sem clínica" (createTasksForClinics sem clínicas
-- selecionadas, seletor "Sem clínica" do dialog) vira interna; o resto é
-- tarefa de clínica.
update tasks set is_internal = true where clinic_id is null;
