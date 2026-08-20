-- expand_pendencias_to_suggestions() só comparava a 'acao' nova contra tasks/
-- acompanhamentos JÁ ABERTOS. Enquanto a sugestão fica pendente na fila (sem
-- ninguém aceitar/descartar), a mesma pendência reaparecendo em resumos dos
-- dias seguintes — reformulada pela IA — não batia com nada em `tasks` e
-- entrava de novo, empilhando variações de texto do mesmo problema. Passa a
-- checar também task_suggestions com status='pending' da mesma clínica/kind.
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
          and tk.status in ('pendente', 'em_andamento')
          and similarity(tk.title, trim(t.value ->> 'acao')) > 0.35
      )
    end
  on conflict (clinic_id, summary_id, text) do nothing;
  return new;
end;
$$;
