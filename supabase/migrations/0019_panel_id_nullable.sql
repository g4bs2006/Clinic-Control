-- O provisionamento automático cria a integração (token) ANTES do painel
-- existir — o painel não tem endpoint de criação na API e é detectado depois.
-- panel_id era not null da época em que a integração só nascia junto com um
-- painel escolhido na UI.
alter table clinic_integrations alter column panel_id drop not null;
