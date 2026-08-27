-- "Tarefa aberta" passa a incluir `em_aprovacao` na anti-duplicação de
-- sugestões (ADR 0011).
--
-- expand_pendencias_to_suggestions (última versão em 0080) só considera aberta
-- uma tarefa em 'pendente'/'em_andamento'. Enquanto `em_aprovacao` era
-- exclusivo de tarefa interna (ADR 0010) o recorte era inofensivo aqui — este
-- trecho filtra por `tk.clinic_id = new.clinic_id`, e tarefa de clínica nunca
-- assumia esse status. Com o ADR 0011 o status vale para qualquer tarefa: sem
-- este ajuste, uma tarefa de clínica aguardando aprovação contaria como
-- "nenhuma tarefa aberta parecida" e a mesma pendência voltaria pra fila de
-- sugestões no resumo do dia seguinte.
--
-- Só muda a lista de status do NOT EXISTS; o resto da função é idêntico à 0080.
set search_path to clinic_control, public;

create or replace function expand_pendencias_to_suggestions()
returns trigger
language plpgsql
set search_path = clinic_control, public
as $$
begin
  insert into task_suggestions (clinic_id, summary_id, text, description, kind, severity)
  select
    new.clinic_id,
    new.id,
    trim(t.value ->> 'acao'),
    nullif(trim(coalesce(t.value ->> 'motivo', '')), ''),
    case when t.value ->> 'tipo' = 'acompanhamento' then 'acompanhamento' else 'acao' end,
    new.severity
  from jsonb_array_elements(coalesce(new.highlights -> 'tarefas', '[]'::jsonb)) as t(value)
  where trim(coalesce(t.value ->> 'acao', '')) <> ''
    -- não duplica sugestão ainda pendente na fila para a mesma clínica/kind
    and not exists (
      select 1 from task_suggestions ts
      where ts.clinic_id = new.clinic_id
        and ts.status = 'pending'
        and ts.kind = case when t.value ->> 'tipo' = 'acompanhamento' then 'acompanhamento' else 'acao' end
        and similarity(ts.text, trim(t.value ->> 'acao')) > 0.35
    )
    and case
      when t.value ->> 'tipo' = 'acompanhamento' then not exists (
        select 1 from acompanhamentos a
        where a.clinic_id = new.clinic_id
          and a.status = 'aberto'
          and similarity(a.title, trim(t.value ->> 'acao')) > 0.35
      )
      else not exists (
        select 1 from tasks tk
        where tk.clinic_id = new.clinic_id
          and tk.status in ('pendente', 'em_andamento', 'em_aprovacao')
          and similarity(tk.title, trim(t.value ->> 'acao')) > 0.35
      )
    end
  on conflict (clinic_id, summary_id, text) do nothing;
  return new;
end;
$$;
