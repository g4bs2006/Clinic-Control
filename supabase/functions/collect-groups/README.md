# Edge Function `collect-groups`

Coleta diária das mensagens dos grupos de WhatsApp (Evolution API) → Supabase
(`clinic_control.whatsapp_group_messages` + `whatsapp_groups`). **Substitui o
workflow n8n** — tudo num sistema só.

Fluxo: `fetchAllGroups` → para cada grupo `findMessages` (concorrência 5) →
normaliza → upsert idempotente (`onConflict group_jid,message_id`).

## 1. Secrets (Dashboard → Edge Functions → collect-groups → Secrets)
- `EVOLUTION_API_URL` — ex.: `https://sua-evolution.com` (sem barra no fim)
- `EVOLUTION_API_KEY` — apikey da Evolution
- `EVOLUTION_INSTANCE` — nome da instância (ex.: `CONTAC.IA`)
- `CRON_SECRET` — segredo que você escolhe; o agendador envia no header `x-cron-secret`

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente.
> Pré-requisito: `clinic_control` exposto em Settings → API → Exposed schemas.

## 2. Backfill manual (pega TODO o histórico) e teste
```bash
curl -X POST "https://jggfnfxdtfqeqyvxufgu.supabase.co/functions/v1/collect-groups?lookbackHours=0" \
  -H "x-cron-secret: <CRON_SECRET>"
```
Resposta: `{ ok, groups, messages_seen, inserted, fetchErrors, insertErrors }`.

## 3. Agendamento diário (18h BRT = 21:00 UTC)

**Opção A — Dashboard (recomendado):** Integrations → Cron → Create job →
Type "Supabase Edge Function" → `collect-groups`, schedule `0 21 * * *`,
query `?lookbackHours=24`, header `x-cron-secret: <CRON_SECRET>`.

**Opção B — SQL (pg_cron + pg_net + Vault):**
```sql
-- guardar o secret no Vault (uma vez; mesmo valor do secret da função)
select vault.create_secret('<CRON_SECRET>', 'collect_groups_cron_secret');

select cron.schedule('collect-groups-daily', '0 21 * * *', $$
  select net.http_post(
    url := 'https://jggfnfxdtfqeqyvxufgu.supabase.co/functions/v1/collect-groups?lookbackHours=24',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='collect_groups_cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```
`lookbackHours=24` no dia a dia (incremental); `0` só no backfill.

## Notas
- Idempotente: reexecutar não duplica (unique `group_jid, message_id`).
- Lógica pura em `normalize.ts` (testada em `tests/whatsapp-collect.test.ts`).
- `fetchErrors`/`insertErrors` no retorno sinalizam cobertura parcial.
