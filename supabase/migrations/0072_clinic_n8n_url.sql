-- Link do workflow do n8n correspondente à clínica. Puramente de referência:
-- ninguém chama essa URL, ela só existe para o dev abrir o workflow certo em um
-- clique quando estiver depurando a automação de agendamento (hoje a pessoa
-- procura o workflow na lista do n8n pelo nome, que nem sempre bate com o nome
-- da clínica — ver as divergências de nome documentadas na 0070).
--
-- Fica em `clinics` e não em `clinic_integrations` de propósito: é anotação do
-- cadastro, não credencial nem configuração que a automação consome, e precisa
-- funcionar mesmo para clínica sem integração Helena vinculada.
set search_path to clinic_control, public;

alter table clinics add column if not exists n8n_url text;
