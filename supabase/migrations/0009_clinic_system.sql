-- Sistema/prontuário que a clínica utiliza (ex.: Clinicorp, Google Agenda…).
-- Texto livre validado na aplicação contra a lista em src/lib/clinics/systems.ts.

alter table clinics add column if not exists system text;
