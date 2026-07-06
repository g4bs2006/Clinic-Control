-- Com o auth próprio (0025) todo acesso do app passa pelo service_role, mas
-- algumas views/tabelas antigas só tinham grant para `authenticated` (ex.:
-- whatsapp_response_stats, 0012) → "permission denied" no dashboard.
-- Garante o service_role em tudo que existe e no que vier a existir.
grant usage on schema clinic_control to service_role;
grant all on all tables in schema clinic_control to service_role;
grant all on all sequences in schema clinic_control to service_role;
grant execute on all functions in schema clinic_control to service_role;
alter default privileges in schema clinic_control grant all on tables to service_role;
alter default privileges in schema clinic_control grant all on sequences to service_role;
