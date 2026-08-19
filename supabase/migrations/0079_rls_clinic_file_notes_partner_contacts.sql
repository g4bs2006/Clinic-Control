-- Fecha as duas tabelas que nasceram sem RLS: clinic_file_notes (0060) e
-- partner_contacts (0065). O advisory do Supabase as acusava como "fully
-- exposed to the anon and authenticated roles" — com a anon key sendo
-- NEXT_PUBLIC_ e o repositório público, qualquer pessoa lia e escrevia as
-- anotações de arquivo e os contatos (nome, e-mail e telefone de parceiros).
--
-- Ligar RLS sem policy nenhuma é o estado CORRETO aqui, não um esquecimento:
-- o app não usa mais Supabase Auth e todo acesso é service role, que ignora
-- RLS por definição (src/lib/supabase/server.ts). Conferido antes de aplicar
-- que nenhum componente lê estas tabelas pelo client de browser — os únicos
-- `.from()` no cliente são em buckets de Storage. Mesma postura da 0078.
set search_path to clinic_control, public;

alter table clinic_file_notes enable row level security;
revoke all on clinic_file_notes from anon, authenticated;
grant all on clinic_file_notes to service_role;

alter table partner_contacts enable row level security;
revoke all on partner_contacts from anon, authenticated;
grant all on partner_contacts to service_role;
