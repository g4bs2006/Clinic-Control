-- Opções do provisionamento Helena escolhidas na criação da clínica:
-- { apps: string[], resourcers: string[], config: { whatsAppChannels, panels, ... } }.
-- Usadas pelo runProvisioning (inclusive no Reprocessar).
alter table clinics add column if not exists helena_provision_options jsonb;
