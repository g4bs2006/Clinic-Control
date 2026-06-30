-- Uma clínica pode ter o mesmo agente em unidades diferentes (ex.: "Haline" em
-- Tirol e Nova Esperança). A unicidade passa a incluir a unidade (tratando NULL
-- como string vazia, já que UNIQUE ignora NULLs).

alter table clinic_agents drop constraint if exists clinic_agents_clinic_id_name_key;

create unique index if not exists clinic_agents_clinic_name_unit_idx
  on clinic_agents (clinic_id, name, coalesce(unit, ''));
