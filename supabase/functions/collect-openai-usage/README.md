# Edge Function `collect-openai-usage`

Coleta diária do consumo OpenAI **por API key** → Supabase
(`clinic_control.openai_key_usage` + caches `openai_api_keys`/`openai_projects` +
agregado real `clinic_openai_usage`). A organização concentra tudo em poucos
projetos (praticamente só o "I.A. Fluxodonto"), mas **cada clínica tem a própria
API key** — a key é o identificador da clínica (`clinics.openai_api_key_id`,
select "API key OpenAI" na página da clínica).

Custo por key é **estimado**: tokens × preço por modelo (tabela `MODEL_PRICES`
no código, pesos relativos), **calibrado** por dia para a soma bater com o custo
real de `/organization/costs` (que só quebra por projeto). O rateio por clínica
soma exatamente a fatura do dia; gasto não-chat (whisper/tts/embeddings) é
absorvido proporcionalmente.

Fluxo: lista projetos + API keys (cache p/ UI) → `/organization/usage/completions`
com `group_by=api_key_id,model` (tokens, bucket 1d) → idem `group_by=project_id`
+ `/organization/costs` (US$ real) → calibração → upserts → **alertas de gasto**
(limite absoluto + anomalia vs média 7d) sobre o custo estimado do último dia
fechado (ontem, UTC), criando acompanhamentos para o dev da clínica.

## 1. Secrets (Dashboard → Edge Functions → Secrets — são do projeto todo)
- `OPENAI_ADMIN_KEY` — Admin Key da organização (`sk-admin-...`), criada em
  [platform.openai.com/settings/organization/admin-keys](https://platform.openai.com/settings/organization/admin-keys)
  por um **Owner**, com escopos **`api.usage.read` + `api.management.read`**
  (billing NÃO é necessário). A chave comum `sk-...` NÃO serve.
- `CRON_SECRET` — segredo enviado no header `x-cron-secret` (compartilhado com
  o collect-groups; Vault: `collect_groups_cron_secret`)

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente.
> Pré-requisito: migrações `0053_openai_usage.sql` + `0055_openai_key_usage.sql`.

## 2. Backfill manual (últimos 30 dias), teste e diagnóstico
```bash
curl -X POST "https://jggfnfxdtfqeqyvxufgu.supabase.co/functions/v1/collect-openai-usage?lookbackDays=30" \
  -H "x-cron-secret: <CRON_SECRET>"
# diagnóstico (não grava nada): lista projetos, keys e amostra de usage
curl -X POST ".../collect-openai-usage?probe=1" -H "x-cron-secret: <CRON_SECRET>"
```
Resposta: `{ ok, projects, apiKeys, keyUsageRows, upserted, alertDay, alerts, calibDebug, ... }`.

## 3. Agendamento diário (7h BRT = 10:00 UTC)

Cron `collect-openai-usage-daily` já agendado (job via pg_cron + pg_net + Vault,
`0 10 * * *` com `?lookbackDays=3`). O custo do dia anterior consolida na OpenAI
com algumas horas de atraso — por isso o horário da manhã e o re-upsert.

```sql
select cron.schedule('collect-openai-usage-daily', '0 10 * * *', $$
  select net.http_post(
    url := 'https://jggfnfxdtfqeqyvxufgu.supabase.co/functions/v1/collect-openai-usage?lookbackDays=3',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='collect_groups_cron_secret')
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

Disparo → linha em `openai_usage_alerts` (dedup por key+dia+tipo, unique parcial
`openai_usage_alerts_key_day_kind`) + acompanhamento severidade alta para o
`developer_id` da clínica (dedup de episódio: não empilha enquanto houver
acompanhamento "Gasto OpenAI alto…" aberto). Entra nos digests do `notify`.

## Notas
- Dias em **UTC** (bucket da própria OpenAI) — a soma do mês bate com o
  dashboard platform.openai.com/usage.
- Idempotente: reexecutar não duplica (PKs; re-runs re-calibram o dia).
- `amount.value` da API de costs chega como **string** — sempre `Number()` ao
  acumular (bug real: concatenação silenciosa quebrava a calibração).
- O app NÃO precisa da `OPENAI_ADMIN_KEY`: o select de vínculo lê o cache
  `openai_api_keys`, alimentado por esta função. A chave vive só aqui.
- Colunas/tabelas por projeto (0053) seguem alimentadas: agregado real da
  organização e base da calibração. `clinics.openai_project_id` ficou órfã.
