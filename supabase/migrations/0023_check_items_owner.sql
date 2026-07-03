-- Checklists 100% pessoais: cada item pertence a um usuário (dev ou gestor).
-- Cada um vê/edita apenas os próprios itens; o gestor pode LER o checklist do
-- desenvolvedor responsável no perfil da clínica (enforcement no app).
-- Itens existentes são atribuídos ao Gabriel (dono de toda a carteira hoje).
alter table check_items add column if not exists owner_id uuid references auth.users(id) on delete cascade;

update check_items
set owner_id = (select id from user_profiles where email = 'gabriel.rodrigues@escalarodonto.com.br')
where owner_id is null;

alter table check_items alter column owner_id set not null;
create index if not exists check_items_owner_idx on check_items (owner_id);
