-- O auto-kick de job travado (STALL_MS=90s no polling da UI) redisparava um
-- tick sem checar se o tick anterior ainda estava em voo. Como o resumo do
-- dia corrente SEMPRE regenera (force=true em summarize-groups), um segundo
-- tick pro mesmo lote de clínicas não era um no-op: era uma segunda chamada
-- de LLM (não-determinística) sobre as mesmas mensagens, cada upsert
-- disparando o trigger de sugestões de novo — daí filas com a mesma pendência
-- reformulada 8-10x em menos de 2 minutos.
-- `processing_since` é o lock: um tick só roda se não houver outro em voo (ou
-- se o lock anterior está velho demais pra ser um tick travado de verdade).
set search_path to clinic_control, public;

alter table suggestion_jobs
  add column if not exists processing_since timestamptz;
