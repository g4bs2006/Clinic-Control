-- Congela as métricas derivadas do funil no snapshot mensal. Até aqui só
-- leads/scheduled/rate/revenue eram congelados — no-show, compareceu, fechados
-- e não-agendados só existiam no funil AO VIVO do mês corrente e se perdiam na
-- virada do mês. Com as colunas persistidas, o histórico passa a acumular
-- (tendência de no-show, comparecimento etc. ao longo dos meses).
-- Nullable: null = mês congelado antes desta migration (não capturado na época);
-- clínicas manuais também ficam null (não lançam essas métricas).
set search_path to clinic_control, public;

alter table monthly_snapshots
  add column if not exists no_show       int,
  add column if not exists attended      int,
  add column if not exists closed        int,
  add column if not exists not_scheduled int;
