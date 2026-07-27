-- Multi-estrategista: uma clínica pode ter mais de um estrategista. A coluna
-- única `clinics.strategist` (texto) vira `strategists` (array de nomes, mesma
-- ideia de guardar o NOME de partner_contacts). O antigo rótulo combinado
-- "Ana Paula e Guilherme Battistella" é desmembrado nos dois estrategistas.
set search_path to clinic_control, public;

alter table clinics add column if not exists strategists text[] not null default '{}';

update clinics set strategists = case
  when strategist = 'Ana Paula e Guilherme Battistella' then array['Ana Paula', 'Guilherme Battistella']
  when strategist is not null and strategist <> '' then array[strategist]
  else '{}'
end;

alter table clinics drop column if exists strategist;

-- O combinado deixa de ser uma opção; garante o avulso e remove o par.
insert into partner_contacts (role, name, position) values ('strategist', 'Guilherme Battistella', 8)
  on conflict (role, name) do nothing;
delete from partner_contacts where role = 'strategist' and name = 'Ana Paula e Guilherme Battistella';
