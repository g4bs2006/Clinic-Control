-- Estrategista e gestor de tráfego são pessoas do ecossistema, mas fora do
-- sistema (sem login) — texto livre validado na aplicação contra as listas em
-- src/lib/clinics/strategists.ts e src/lib/clinics/traffic-managers.ts, mesmo
-- padrão de clinics.system (0009).
-- Plano é a classificação comercial da clínica no ecossistema.
-- odontoimpact indica se a clínica tem assinatura de tráfego pago; o gestor
-- de tráfego só faz sentido quando essa assinatura existe.
set search_path to clinic_control, public;

create type clinic_plan as enum ('black', 'elite');

alter table clinics add column if not exists strategist text;
alter table clinics add column if not exists plan clinic_plan;
alter table clinics add column if not exists odontoimpact boolean not null default false;
alter table clinics add column if not exists traffic_manager text;
