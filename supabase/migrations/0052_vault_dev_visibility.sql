-- Visibilidade por item para desenvolvedores: o gestor marca quais itens do
-- cofre a equipe pode ver e revelar (ex.: senha do dashboard sim, service key
-- do Supabase não). Default FALSE — item novo nasce só-gestor e é uma decisão
-- explícita abri-lo. A filtragem acontece no servidor (listCredentials /
-- revealSecret); mutações continuam só-gestor.
set search_path to clinic_control, public;

alter table credential_vault
  add column visible_to_devs boolean not null default false;
