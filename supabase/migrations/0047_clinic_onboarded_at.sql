-- Âncora explícita do onboarding: quando a clínica ficou "operacional".
-- Alimenta o diagnóstico pós-onboarding (tarefas nos primeiros 30 dias apontam
-- as etapas fracas do processo de implantação). NULL = onboarding em andamento;
-- clínicas antigas sem a data usam created_at como âncora aproximada (fallback
-- no app). Marcada por um botão no perfil da clínica, junto do checklist.
set search_path to clinic_control, public;

alter table clinics
  add column if not exists onboarded_at date;
