-- Segunda dimensão do funil, ortogonal ao mapeamento de colunas: quem realizou
-- o agendamento, via ETIQUETA do card na Helena (não a coluna/step).
--   crc_tag_ids → etiquetas que identificam agendamento feito pelo time humano (CRC).
--   ia_tag_ids  → etiquetas que identificam agendamento feito pela IA.
-- Um card agendado sem nenhuma dessas etiquetas (ou com etiqueta desconhecida/
-- removida da conta) cai no bucket "não classificado" — não há fallback canônico
-- aqui, já que não existe convenção de nome de etiqueta entre clínicas.
-- NULL nas duas colunas = clínica nunca configurada essa dimensão.
set search_path to clinic_control, public;

alter table clinic_integrations
  add column if not exists crc_tag_ids uuid[],
  add column if not exists ia_tag_ids uuid[];
