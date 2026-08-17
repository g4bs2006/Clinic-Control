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

> ✅ JÁ ATIVO via pg_cron: job `collect-groups-daily` (`0 21 * * *`), secret no Vault
> (`collect_groups_cron_secret`). Ver/gerir:
> `select * from cron.job;` · desativar: `select cron.unschedule('collect-groups-daily');`
> · histórico: `select * from cron.job_run_details order by start_time desc limit 10;`

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

## Por que a coleta trabalha em fatias

Entre 2026-08-10 e 17 a coleta ficou **7 dias sem inserir uma linha** — e, por
tabela, os resumos diários e a geração de tarefas por IA pararam (sem mensagem
nova, toda clínica caía em `skipped_few_messages`). O `?probe=1` mediu a causa
contra a Evolution de produção:

| Medida | Resultado |
|---|---|
| `fetchAllGroups` | ~12s |
| `findMessages` (1 página) | **~3,4s por grupo** |
| 8 grupos sequencial vs paralelo | 27,2s vs 20,4s → **serializa** |

O custo é **fixo por query**, não por payload (88KB levou 6,1s; 621KB levou
4,5s), então nem paginar menos nem paralelizar mais compram tempo. Com 81
grupos isso dá ~275s + 12s ≈ **287s contra ~200s de limite de execução** da
Edge Function: **uma coleta completa não cabe em uma execução**. Como a versão
antiga só gravava no fim, ser morta aos 200s descartava 100% do trabalho — daí
os 7 dias de zero, com o `cron.job_run_details` mostrando `succeeded` o tempo
todo (o `net.http_post` só registra o enfileiramento, não o resultado).

Por isso a função hoje:

- **grava por lote**, nunca só no fim — ser interrompida não perde o coletado;
- **para sozinha em ~120s** e devolve `200` com `partial: true`, em vez de ser
  morta (o retorno passa a ser sinal honesto de saúde);
- **varre em round-robin** por `last_collected_at` (migration `0076`), com os
  grupos mapeados a clínica na frente — são os que alimentam resumo e tarefas.
  Cada execução continua de onde a anterior parou; as 4 execuções diárias
  cobrem os 50 mapeados todo dia.
- **checkpoint de página por grupo** (`last_synced_page`, migration `0075`):
  a maioria dos grupos tem 1 página, mas há exceções (ex.: *Importante -
  CONTACT IA*, 36.783 mensagens / 37 páginas) que sem teto consumiriam a
  execução inteira. `?lookbackHours=0` (backfill) ignora o checkpoint.

### Diagnóstico (`?probe=1`)

```
POST /functions/v1/collect-groups?probe=1&samples=8
Header: x-cron-secret: <CRON_SECRET>
```
Não coleta nada: mede latência/bytes/`totalPages` por grupo e compara
sequencial vs paralelo. Use antes de mexer em `MAX_PAGES_PER_RUN`,
`CONCURRENCY` ou `RUN_DEADLINE_MS` — foi o que separou "muitas páginas" de
"cada página é lenta", que pedem correções opostas.

### Recuperar dias sem coleta

`lookbackHours` maior não custa requests a mais (a página 1 já traz o histórico
do grupo), então para reprocessar uma janela perdida basta ampliá-la e depois
regerar os resumos dia a dia:
```
POST .../collect-groups?lookbackHours=240
POST .../summarize-groups?date=2026-08-12&force=1   # um por dia perdido
```
O trigger `whatsapp_daily_summaries_expand_pendencias` recria as sugestões de
tarefa sozinho a partir dos resumos (com dedup por similaridade).

## 4. Sincronização on-demand (app)

Botão "Buscar grupos novos" em `/configuracoes` → seção "Grupos de WhatsApp" chama
esta função direto (via `syncWhatsappGroups` em `src/lib/whatsapp/actions.ts`),
sem esperar o cron das 18h — útil quando uma clínica nova entra e o grupo dela
ainda não apareceu na lista de mapeamento. Usa `lookbackHours=24` (não é
backfill). Requer a env var `COLLECT_GROUPS_CRON_SECRET` (mesmo valor deste
secret) configurada no Vercel e no `.env.local`.
