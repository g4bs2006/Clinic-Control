# summarize-groups — resumo diário por IA

Gera, por clínica mapeada, um resumo do que aconteceu no grupo de WhatsApp no
dia, usando a API do DeepSeek (formato OpenAI-compatível). Grava em
`clinic_control.whatsapp_daily_summaries` (upsert por clínica+dia).

## Secrets (Edge Functions → Secrets)
- `CRON_SECRET` — o mesmo já usado pela `collect-groups`.
- `DEEPSEEK_API_KEY` — chave da plataforma DeepSeek (https://platform.deepseek.com).
- `LLM_MODEL` (opcional) — default `deepseek-chat`.
- `LLM_BASE_URL` (opcional) — default `https://api.deepseek.com`. Para trocar de
  provedor (OpenAI, Groq, etc.) basta apontar base/model/key compatíveis.

## Chamadas
```
POST /functions/v1/summarize-groups            # resume HOJE (fuso SP)
POST /functions/v1/summarize-groups?date=2026-07-01
POST /functions/v1/summarize-groups?date=2026-07-01&force=1   # re-gera
Header: x-cron-secret: <CRON_SECRET>
```

Clínicas com menos de 2 mensagens com texto no dia são puladas. Transcript
limitado a ~30k caracteres (mensagens mais antigas do dia entram primeiro).

## Agendamento (pg_cron, 18h45 BRT = 21:45 UTC — após a coleta das 18h)
Job `summarize-groups-daily` criado como o `collect-groups-daily`:
```sql
select cron.schedule('summarize-groups-daily', '45 21 * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/summarize-groups',
    headers := jsonb_build_object(
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'collect_groups_cron_secret'),
      'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000)
$$);
```
Gerir: `select * from cron.job;` / `cron.unschedule('summarize-groups-daily')` /
`select * from cron.job_run_details order by start_time desc limit 10;`
