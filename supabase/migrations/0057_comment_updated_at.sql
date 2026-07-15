-- Adiciona coluna de atualização nos comentários das tarefas para controle de edições do CRUD.
set search_path to clinic_control, public;

alter table task_comments 
  add column if not exists updated_at timestamptz;
