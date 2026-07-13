-- Endurecimento do cofre (achados da revisão de 2026-07-13):
--
-- 1. has_secret gerado no banco: listCredentials selecionava secret_encrypted
--    inteiro só para computar um boolean — o ciphertext do cofre todo
--    trafegava banco→servidor em cada listagem. Agora a listagem lê só a
--    coluna gerada.
--
-- 2. Auditoria sobrevive ao item: o FK era ON DELETE CASCADE, então excluir
--    uma credencial apagava TODO o histórico de quem a revelou — exatamente a
--    trilha que o log existe para preservar ("a senha vazou, quem viu?").
--    Passa a SET NULL, com o nome do serviço denormalizado no log para o
--    histórico continuar legível sem o item.
--
-- 3. Log ganha "action": além de revelações, as mutações (create/update/
--    delete/clear_secret) também são registradas.
set search_path to clinic_control, public;

alter table credential_vault
  add column has_secret boolean generated always as (secret_encrypted is not null) stored;

alter table credential_vault_access_log
  drop constraint credential_vault_access_log_credential_id_fkey;
alter table credential_vault_access_log
  alter column credential_id drop not null;
alter table credential_vault_access_log
  add constraint credential_vault_access_log_credential_id_fkey
    foreign key (credential_id) references credential_vault(id) on delete set null;

alter table credential_vault_access_log
  add column service text,
  add column action text not null default 'reveal';
