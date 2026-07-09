-- Reverte a 0041: o health score composto foi descartado. Decisão: a TAXA de
-- agendamento é o sinal que importa; um score composto exigiria descobrir a
-- causa-raiz da queda pra ser acionável, o que não compensa agora. O painel
-- "Alertas de risco" (por taxa) volta a ser a visão de risco no dashboard.
set search_path to clinic_control, public;

drop table if exists clinic_health_snapshots;
