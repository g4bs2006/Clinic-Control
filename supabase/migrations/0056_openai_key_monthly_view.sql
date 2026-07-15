-- Agregado mensal do uso OpenAI por key. O painel "Gastos de IA" da home
-- somava as linhas cruas key×dia×modelo no app: além do payload, o PostgREST
-- corta silenciosamente em 1000 linhas — com 51 keys × 60 dias × modelos a
-- janela de 2 meses estoura o corte e o ranking sai ERRADO. A view empurra a
-- soma para o Postgres e devolve ≤ ~102 linhas.
set search_path to clinic_control, public;

create or replace view openai_key_monthly
with (security_invoker = true) as
select
  api_key_id,
  to_char(day, 'YYYY-MM') as month,
  sum(est_cost_usd)  as est_cost_usd,
  sum(input_tokens)  as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(requests)      as requests
from openai_key_usage
group by api_key_id, to_char(day, 'YYYY-MM');

-- security_invoker: a RLS da tabela base vale para quem consulta.
revoke all on openai_key_monthly from anon;
grant select on openai_key_monthly to authenticated, service_role;
