# Edge Function `collect-openai-usage`

Coleta diária do consumo OpenAI por projeto → Supabase
(`clinic_control.clinic_openai_usage` + `openai_projects`). Cada clínica é um
**projeto** dentro da organização OpenAI; o vínculo é `clinics.openai_project_id`
(select "Projeto OpenAI" na página da clínica). No fim da coleta avalia os
**alertas de gasto** (limite absoluto + anomalia vs média 7d) e cria
acompanhamentos para o dev da clínica.

Fluxo: lista projetos da organização → `/organization/usage/completions`
(tokens, bucket 1d × projeto) → `/organization/costs` (US$, idem) → upsert por
`(project_id, day)` → avalia alertas do último dia fechado (ontem, UTC).

## 1. Secrets (Dashboard → Edge Functions → collect-openai-usage → Secrets)
- `OPENAI_ADMIN_KEY` — Admin Key da organização (`sk-admin-...`), criada em
  [platform.openai.com/settings/organization/admin-keys](https://platform.openai.com/settings/organization/admin-keys)
  por um **Owner**. A chave comum `sk-...` do chatbot NÃO serve (não lê usage/costs).
- `CRON_SECRET` — segredo que você escolhe; o agendador envia no header `x-cron-secret`

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente.
> Pré-requisito: migração `0053_openai_usage.sql` aplicada.

## 2. Backfill manual (últimos 30 dias) e teste
```bash
curl -X POST "https://jggfnfxdtfqeqyvxufgu.supabase.co/functions/v1/collect-openai-usage?lookbackDays=30" \
  -H "x-cron-secret: <CRON_SECRET>"
```
Resposta: `{ ok, projects, rows, upserted, alertDay, alerts, ... }`.

## 3. Agendamento diário (7h BRT = 10:00 UTC)

O custo do dia anterior consolida na OpenAI com algumas horas de atraso — por
isso o horário da manhã e o `lookbackDays=3` (re-upsert corrige a consolidação).

**Opção A — Dashboard:** Integrations → Cron → Create job → Type "Supabase Edge
Function" → `collect-openai-usage`, schedule `0 10 * * *`, query
`?lookbackDays=3`, header `x-cron-secret: <CRON_SECRET>`.

**Opção B — SQL (pg_cron + pg_net + Vault):**
```sql
-- guardar o secret no Vault (uma vez; mesmo valor do secret da função)
select vault.create_secret('<CRON_SECRET>', 'collect_openai_usage_cron_secret');

select cron.schedule('collect-openai-usage-daily', '0 10 * * *', $$
  select net.http_post(
    url := 'https://jggfnfxdtfqeqyvxufgu.supabase.co/functions/v1/collect-openai-usage?lookbackDays=3',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='collect_openai_usage_cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

## 4. Alertas

Config global na tabela `openai_alert_settings` (linha única):
- `daily_limit_usd` (default US$ 5) — teto absoluto/dia; por clínica dá para
  sobrescrever em `clinics.openai_daily_limit_usd`.
- `spike_multiplier` (default 2,5×) — anomalia vs média dos 7 dias anteriores
  (só com ≥3 dias de histórico).
- `min_cost_usd` (default US$ 1) — piso: abaixo disso nunca alerta.
- `enabled` — desliga tudo.

Disparo → linha em `openai_usage_alerts` (dedup por projeto+dia+tipo) +
acompanhamento severidade alta para o `developer_id` da clínica (dedup de
episódio: não empilha enquanto houver acompanhamento "Gasto OpenAI alto…"
aberto). O acompanhamento entra nos digests do `notify` (9h/19h) normalmente.

## Notas
- Dias em **UTC** (bucket da própria OpenAI) — a soma do mês bate com o
  dashboard platform.openai.com/usage.
- Idempotente: reexecutar não duplica (PK `project_id, day`; alertas com
  unique `project_id, day, kind`).
- O app NÃO precisa da `OPENAI_ADMIN_KEY`: o select de vínculo lê o cache
  `openai_projects`, alimentado por esta função. A chave vive só aqui.
