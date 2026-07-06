-- expand_pendencias_to_suggestions() dependia do search_path da SESSÃO que
-- dispara o trigger, não do que existia ao criar a função — em produção
-- (Edge Function / app) isso resolve para o schema errado e falha com
-- "relation task_suggestions does not exist". Fixa o search_path na própria
-- função para funcionar em qualquer contexto.
create or replace function clinic_control.expand_pendencias_to_suggestions()
returns trigger
language plpgsql
set search_path = clinic_control, public
as $$
begin
  insert into task_suggestions (clinic_id, summary_id, text)
  select new.clinic_id, new.id, trim(pendencia.value #>> '{}')
  from jsonb_array_elements(coalesce(new.highlights -> 'pendencias', '[]'::jsonb)) as pendencia(value)
  where trim(pendencia.value #>> '{}') <> ''
  on conflict (clinic_id, summary_id, text) do nothing;
  return new;
end;
$$;
