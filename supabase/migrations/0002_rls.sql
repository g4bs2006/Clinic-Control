-- Row Level Security (RLS)
-- O Supabase expõe as tabelas via PostgREST usando a chave anon (pública, vai
-- para o browser em NEXT_PUBLIC_). Sem RLS, os dados ficariam abertos. Como o
-- sistema é interno, todo usuário autenticado é da equipe Contact e tem acesso
-- total; o papel anon é bloqueado por padrão (RLS nega o que não tem policy).

alter table clinics enable row level security;
alter table funnel_steps enable row level security;
alter table status_rules enable row level security;

-- Defesa em profundidade: remove qualquer privilégio do papel anônimo.
revoke all on clinics from anon;
revoke all on funnel_steps from anon;
revoke all on status_rules from anon;

-- clinics: acesso total para usuários autenticados (equipe interna).
create policy clinics_authenticated_all on clinics
  for all to authenticated using (true) with check (true);

-- funnel_steps: dados de referência — leitura e gestão pela equipe autenticada.
create policy funnel_steps_authenticated_all on funnel_steps
  for all to authenticated using (true) with check (true);

-- status_rules: faixas configuráveis — leitura e gestão pela equipe autenticada.
create policy status_rules_authenticated_all on status_rules
  for all to authenticated using (true) with check (true);
