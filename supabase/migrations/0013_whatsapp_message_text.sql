-- Texto das mensagens dos grupos (base do resumo diário por IA).
-- A coleta passa a extrair message.conversation/extendedTextMessage.text/captions;
-- o re-backfill (upsert com merge) preenche o histórico.
alter table whatsapp_group_messages add column if not exists text text;
