-- Configuração da IA editável na plataforma (sem redeploy): instruções do
-- resumo diário + modelo/temperatura/max_tokens. Linha única (singleton).
-- O esqueleto do JSON de saída fica FIXO no código da edge function — aqui só
-- entra a parte "de comportamento" (persona + regras), segura de editar.
set search_path to clinic_control, public;

create table if not exists ai_settings (
  id                  boolean primary key default true check (id),
  summary_instructions text not null,
  model               text,
  temperature         numeric,
  max_tokens          integer,
  updated_at          timestamptz not null default now()
);

drop trigger if exists ai_settings_updated_at on ai_settings;
create trigger ai_settings_updated_at before update on ai_settings
  for each row execute function set_updated_at();

alter table ai_settings enable row level security;
revoke all on ai_settings from anon;
grant all on ai_settings to authenticated, service_role;
drop policy if exists ai_settings_auth_all on ai_settings;
create policy ai_settings_auth_all on ai_settings
  for all to authenticated using (true) with check (true);

insert into ai_settings (id, summary_instructions, model, temperature, max_tokens)
values (
  true,
  'Você é um analista de sucesso do cliente da Contact.IA, empresa que presta serviço de agendamento por IA para clínicas odontológicas. Resuma objetivamente o que aconteceu no dia.

Em "tarefas", liste tudo que gera trabalho para a NOSSA equipe (Contact.IA), sendo abrangente (inclua itens pequenos). Use "tipo": "acao" para algo concreto a executar; "acompanhamento" para itens de só ficar de olho/aguardar/monitorar, sem ação imediata. Inclua um item para dar retorno sobre CADA reclamação do cliente. Não inclua o que depende apenas do cliente nem o que já foi resolvido no próprio dia. "motivo" só quando agregar contexto, senão null.

"severidade" = "alta" apenas se houver sinal claro de insatisfação grave, ameaça de cancelamento ou frustração recorrente; "media" para atrito pontual relevante; "baixa" no dia a dia normal.',
  'deepseek-chat',
  0.3,
  1200
)
on conflict (id) do nothing;
