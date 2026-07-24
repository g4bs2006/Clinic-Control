# Polimento do sino de notificações — Design

**Data:** 2026-07-24
**Status:** aprovado (design) — implementação não iniciada

## Problema

A feature de notificações (in-app) já funciona: tabela `notifications`, fontes de
evento (menção/atribuição/comentário), cron de prazo/atraso, sino com painel e
Realtime. Mas a UX do sino tem arestas:

- **Posição estranha:** o sino fica no topo da sidebar, logo depois da busca —
  parece "a primeira coisa" da navegação, quando deveria ser um utilitário do rodapé.
- **Painel raso:** todas as notificações têm o mesmo visual (uma bolinha), sem
  distinção por tipo nem agrupamento temporal.
- **Sem controle:** não dá pra filtrar só as não-lidas nem descartar uma notificação.

Escopo desta rodada (decidido com o usuário): **mudar de lugar + refinar visual +
ações (filtro e descartar)**. Fora de escopo: página "ver todas", cobertura de novos
eventos, e o hardening do token de Realtime (tratado à parte).

## Decisões de produto

- **Lugar do sino:** rodapé da sidebar, como **ícone à esquerda do nome** do usuário
  (`[🔔] [nome/cargo] [sair]`). Aparece **só com a sidebar expandida** (pinned ou
  peek/hover); recolhida, some. No mobile o acesso continua pela top bar (inalterado).
- **Descartar = soft-delete** (não apaga a linha). Ver "Abordagem escolhida".
- **Filtro** "Não-lidas / Todas": client-side sobre os itens já carregados (sem query
  nova). Limite de carga sobe de 20 → 30 para dar folga ao filtro.
- **Distinção visual por tipo:** ícone + cor por `NotificationType`. A bolinha deixa
  de indicar "tipo" e passa a marcar apenas não-lida.
- **Agrupar por dia:** cabeçalhos "Hoje / Ontem / Esta semana / Antes".

## Abordagem escolhida (A) — descartar via soft-delete

Coluna nova `notifications.dismissed_at timestamptz`. Descartar grava `now()`; as
leituras filtram `dismissed_at is null`.

**Por que não hard-delete:** o cron de prazo (`0063_notify_task_due.sql`) deduplica
por `dedupe_key` único com `on conflict do nothing` — o que depende da **linha
existir**. Apagar a linha de uma notificação `task_due_soon`/`task_overdue` faz o cron
diário **recriá-la na manhã seguinte**. Soft-delete mantém a linha (e o `dedupe_key`),
então o descarte "cola". Bônus: reversível e auditável.

Alternativas descartadas: (B) hard delete — simples, mas reaparece os lembretes de
prazo; (C) só "limpar todas as lidas" — aquém do pedido.

## Modelo de dados

### Migration `0064_notification_dismissed.sql` (schema `clinic_control`)
```sql
set search_path to clinic_control, public;
alter table notifications add column if not exists dismissed_at timestamptz;
```
Aditivo e não-destrutivo. `null` = ativa; timestamp = descartada. Sem novo índice: o
índice existente `notifications_recipient_idx (recipient_id, read_at, created_at desc)`
já cobre a listagem; o filtro `dismissed_at is null` é um predicado barato sobre um
conjunto pequeno (notificações de um usuário).

## Camada de dados (`src/lib/notifications/actions.ts`)

- `listNotifications(limit = 30)` — acrescenta `.is("dismissed_at", null)`.
- `getUnreadNotificationCount()` — acrescenta `.is("dismissed_at", null)` (uma
  descartada não conta como não-lida).
- **Nova action** `dismissNotification(id): Promise<{ ok: true } | { ok: false; error }>`
  — escopada por `recipient_id = user.id` (mesmo padrão de `markNotificationRead`),
  grava `dismissed_at = now()` só se ainda `null`. Exige sessão.

O helper de escrita (`create.ts`), as fontes (`task-events.ts`) e o cron (`0063`)
**não mudam**.

## UI

### `src/components/notifications/notification-bell.tsx`

- **Modo compacto no rodapé:** hoje `placement="sidebar"` + `expanded` renderiza uma
  linha larga rotulada "Notificações". No rodapé queremos só o ícone com badge. Ajuste:
  o gatilho no rodapé é sempre ícone (reaproveita o visual do estado recolhido),
  independente de `expanded`. (Implementação: tratar o rodapé como uma variante de
  `placement`, ou um prop `compact` — decisão de implementação, não de design.)
- **Dropdown abre para cima:** com o sino no rodapé, o painel (`max-h-[70vh]`) precisa
  ancorar na base. Trocar o posicionamento desktop de `md:top-0` para `md:bottom-0`
  (continua `left-full ml-2`, abrindo à direita). Mobile permanece via top bar.
- **Ícone + cor por tipo** (`NotificationType` → ícone lucide + classe de cor):
  - `mention` → `AtSign` (brand)
  - `task_assigned` → `UserPlus` (indigo)
  - `task_comment` → `MessageSquare` (slate)
  - `task_due_soon` → `Clock` (âmbar)
  - `task_overdue` → `AlertTriangle` (vermelho)
  - `acompanhamento_assigned` → `ClipboardList` (teal)
  - Fallback (`Bell`) para tipo desconhecido — nunca quebra.
  A bolinha de não-lida vira um marcador discreto (ex.: ponto na borda) já que a cor
  do ícone agora carrega o tipo.
- **Agrupamento por dia:** função pura de bucket (`Hoje/Ontem/Esta semana/Antes`) a
  partir de `created_at`, no fuso `America/Sao_Paulo`; cabeçalhos sticky leves na lista.
- **Filtro Não-lidas/Todas:** toggle no cabeçalho do painel; estado local; filtra
  `items` por `read_at == null`. "Marcar todas como lidas" continua.
- **Botão descartar:** "×" que aparece no hover de cada item; chama `dismissNotification`
  otimista (remove de `items`; se era não-lida, `count -= 1`); reverte + `refreshCount()`
  se o servidor recusar.

### `src/components/app-nav.tsx`

- Remover o bloco do sino do topo (após a busca).
- No rodapé (`{/* Footer: usuário logado + sair */}`), inserir o sino como ícone à
  esquerda do nome, **dentro do `{open && ...}`** (só expandida). Ordem final:
  `[🔔] [nome/cargo (flex-1)] [sair]`.

## Estados e comportamento sem Realtime

- Sem `SUPABASE_JWT_SECRET` (Realtime desligado), o sino já cai no fallback de polling
  do contador (foco + 60s) e recarrega itens ao abrir. Nada nesta rodada depende de
  Realtime — descartar/filtrar/agrupar são client + action.
- Contador: descartar ajusta otimista; reconciliação de 60s/foco existente cobre drift.

## Etapas de entrega (cada uma = doc atualizada + 1 commit; tudo aditivo, não quebra prod)

1. Migration `0064_notification_dismissed.sql` (coluna) — deploy isolado, sem uso ainda.
2. Leituras filtram `dismissed_at` + action `dismissNotification` (camada de dados).
3. Mudança de lugar do sino (app-nav + modo compacto + dropdown para cima).
4. Refino visual (ícones/cores por tipo + agrupamento por dia).
5. Ações na UI: filtro Não-lidas/Todas + botão descartar.

## Testes

- **Lógica pura** (novo `src/lib/notifications/grouping.ts` ou similar):
  `dayBucket(createdAt, now)` → `hoje|ontem|semana|antes`, com virada de dia/semana no
  fuso America/Sao_Paulo.
- **Action** `dismissNotification`: só afeta linha do próprio usuário; idempotente
  (descartar duas vezes não erra); item descartado some da lista e do contador.
- **Regressão do cron:** descartar um `task_overdue` (soft-delete) e re-rodar
  `notify_task_due()` não recria a linha (o `dedupe_key` ainda existe).
