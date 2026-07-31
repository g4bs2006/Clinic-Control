-- Campo "Campanha" na automação de agendamento (2026-07-31).
--
-- A automação já gravava as duas datas ("Agendado em" / "Agendado para") num
-- campo personalizado do painel. Falta o terceiro que as contas já têm criado:
-- "Campanha" — de onde veio o lead (a campanha de tráfego), gravado no card.
-- Confirmado na Helena em 31/07: 9 das 12 primeiras contas com painel já têm o
-- campo, com a chave `campanha` ou `campanha-` (o hífen final aparece quando o
-- nome foi cadastrado com dois-pontos, mesmo padrão de `agendado-em-`).
--
-- Mesmo desenho dos outros dois: identificador é a `key` do campo (texto, não
-- uuid), fonte da verdade no clinic_control e espelho em public.automacao_clinicas
-- para os workflows do n8n lerem (ver lib/clinics/automation-projection.ts).
set search_path to clinic_control, public;

alter table clinic_integrations
  add column if not exists automation_campaign_field_key text; -- "Campanha"

-- Espelho lido pelo n8n. Nomenclatura em português igual às colunas irmãs
-- (agendado_em_field_key / agendado_para_field_key) para não misturar idioma na
-- mesma tabela — o workflow do n8n passa a ler `campanha_field_key`.
alter table public.automacao_clinicas
  add column if not exists campanha_field_key text;
