-- Remove a tabela user_invites: o fluxo de convite/ativação de conta foi
-- descontinuado (usuários agora são criados direto pelo gestor em
-- Configurações → Usuários, já com senha temporária). Nada mais referencia
-- esta tabela — a única FK era user_invites.invited_by → app_users (a tabela
-- dona), que sai junto no drop.
set search_path to clinic_control, public;

drop table if exists user_invites;
