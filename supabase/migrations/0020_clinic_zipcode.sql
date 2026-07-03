-- CEP da clínica — exigido pela Helena para gravar o endereço da conta
-- (a API valida contra base real de CEPs; sem CEP não enviamos address).
alter table clinics add column if not exists zipcode text;
