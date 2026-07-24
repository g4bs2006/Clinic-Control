-- Soft-delete de notificações: "descartar" no sino grava dismissed_at em vez de
-- apagar a linha. Motivo: o cron de prazo (0063_notify_task_due) deduplica por
-- dedupe_key único com ON CONFLICT DO NOTHING, o que depende da LINHA existir.
-- Apagar a linha faria o cron diário recriar o aviso no dia seguinte. Mantendo a
-- linha (só marcando dismissed_at) o descarte "cola". As leituras passam a filtrar
-- dismissed_at IS NULL. Aditivo e não-destrutivo.
set search_path to clinic_control, public;

alter table notifications add column if not exists dismissed_at timestamptz;
