-- Checkboxes fixos (globais) + estado de checklist POR USUÁRIO.
--
-- Até aqui os itens de checklist eram 100% pessoais (check_items.owner_id) e o
-- estado por clínica vivia em clinic_checks com chave (clinic_id, check_item_id)
-- — bastava, porque cada item tinha um único dono. Agora:
--   1) itens podem ser GLOBAIS (is_global): aparecem em toda clínica, para todos
--      os usuários, independentemente de carteira. Só o gestor os gerencia
--      (enforcement no app).
--   2) o estado (marcado/desmarcado) passa a ser INDIVIDUAL por usuário — cada um
--      tem o próprio progresso, inclusive nos itens globais. Por isso clinic_checks
--      ganha user_id e a unicidade vira (clinic_id, check_item_id, user_id).
set search_path to clinic_control, public;

-- 1) Item global
alter table check_items add column if not exists is_global boolean not null default false;

-- 2) Estado por usuário
alter table clinic_checks add column if not exists user_id uuid references app_users(id) on delete cascade;

-- Backfill: linhas existentes pertencem ao dono do item pessoal.
update clinic_checks cc
set user_id = ci.owner_id
from check_items ci
where ci.id = cc.check_item_id and cc.user_id is null;

-- Nova unicidade por (clínica, item, usuário).
alter table clinic_checks drop constraint if exists clinic_checks_clinic_id_check_item_id_key;
alter table clinic_checks add constraint clinic_checks_clinic_item_user_key
  unique (clinic_id, check_item_id, user_id);
alter table clinic_checks alter column user_id set not null;

create index if not exists clinic_checks_user_idx on clinic_checks (user_id);
