# Reuniões de onboarding (D+7 / D+15 / D+30) — Design

**Data:** 2026-07-21
**Status:** aprovado (design) — implementação não iniciada

## Problema

Toda clínica que entra deveria ter reuniões de acompanhamento de implantação em três
marcos: 7, 15 e 30 dias após o início do onboarding. Hoje isso é informal — não há
registro, lembrete nem visão consolidada. Queremos que essas reuniões sejam geradas
automaticamente, apareçam no fluxo diário do responsável e fiquem visíveis para o gestor.

## Decisões de produto

- **Modelo híbrido**: cada reunião é uma entidade própria (registro com data, status e
  ata) que **também** gera uma tarefa-lembrete espelho no sistema de tarefas existente.
- **Âncora**: campo novo `clinics.onboarding_started_at` (date). As 3 reuniões só nascem
  quando o gestor/dev preenche essa data (ex.: no kickoff). Não usamos `created_at`
  (pode haver defasagem entre cadastro e início real) nem `onboarded_at` (marca o *fim*).
- **Responsável**: dev da carteira (`clinics.developer_id`) recebe a tarefa espelho.
  O gestor tem um painel consolidado. Sem lembrete por WhatsApp nesta versão.
- **Backfill**: apenas clínicas novas — as reuniões nascem quando `onboarding_started_at`
  for preenchido daqui em diante. Nenhuma geração retroativa.
- **Marcos**: `7`, `15`, `30` armazenados como `int` cru (não enum).

## Abordagem escolhida (A)

Sincronização na âncora + tarefa materializada sob demanda:

- Preencher `onboarding_started_at` insere (upsert idempotente) 3 linhas em `clinic_meetings`.
- A tarefa-lembrete é materializada preguiçosamente por `materializeMeetingTasks()`,
  chamada na abertura do dashboard e de `/tarefas` — mesmo padrão do `materializeRecurrences()`
  já existente. Evita poluir a lista com 3 tarefas futuras e não adiciona infra de cron.
- **A reunião é a fonte da verdade.** Concluir a tarefa espelho propaga → reunião `realizada`.

Alternativas descartadas: (B) criar as 3 tarefas de imediato — polui a lista e complica
reconfiguração; (C) Edge Function via pg_cron — overkill, agendamento fora do versionamento,
desnecessário já que a âncora é uma ação manual do usuário.

## Modelo de dados

### Coluna nova em `clinics`
```sql
alter table clinics add column if not exists onboarding_started_at date;
```
`null` = onboarding não iniciado. Fica ao lado de `onboarded_at` (fim); os dois delimitam
a janela de implantação.

### Tabela `clinic_meetings` (migration `0059_clinic_meetings.sql`, schema `clinic_control`)

| coluna | tipo | notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `clinic_id` | uuid FK→clinics | `on delete cascade` |
| `milestone` | int NOT NULL | `7`, `15` ou `30` |
| `scheduled_for` | date NOT NULL | `onboarding_started_at + milestone` |
| `status` | text NOT NULL default `'agendada'` | `agendada / realizada / remarcada / nao_compareceu / pulada` |
| `notes` | text | ata/observações |
| `done_at` | timestamptz | quando marcada realizada |
| `task_id` | uuid FK→tasks | `on delete set null` — tarefa-lembrete espelho |
| `created_at` / `updated_at` | timestamptz | trigger `set_updated_at` (padrão do projeto) |

- Índice único `(clinic_id, milestone)` — no máx. 3 reuniões/clínica, geração re-executável.
- Índices de leitura: `(clinic_id)` e `(status, scheduled_for)` (painel do gestor).
- RLS no padrão do projeto: `enable row level security` + `grant all to authenticated` +
  `revoke from anon` + policy `for all to authenticated using(true)`.

## Server actions (`src/lib/clinics/meeting-actions.ts`, `"use server"`)

Retorno padrão `{ ok: true } | { ok: false; error: string }`; gate por `getSessionUser`.

- `startClinicOnboarding(clinicId, startDate /* YYYY-MM-DD */)`
  - Grava `clinics.onboarding_started_at`.
  - Upsert de 3 reuniões (marcos 7/15/30), `scheduled_for = startDate + N`,
    `onConflict: "clinic_id,milestone"` (idempotente).
  - Se a data mudar depois: recalcula `scheduled_for` das reuniões **não realizadas**;
    as `realizada` ficam congeladas como histórico.
- `materializeMeetingTasks(): Promise<void>` — **nunca lança** (try/catch, como
  `materializeRecurrences`). Chamada na abertura do dashboard e de `/tarefas`.
  Para cada reunião `agendada`/`remarcada` sem `task_id` e com `scheduled_for` dentro da
  janela (faltando ≤ 3 dias ou já vencida): cria `task` (`category:'onboarding'`,
  `title:"Reunião D+<n> — <clínica>"`, `due_date: scheduled_for`,
  `assigned_to: developer_id`) e grava `task_id` na reunião. Idempotente pelo `task_id`.
- `setMeetingOutcome(meetingId, status, notes?)` — atualiza status/notes/`done_at`.
  Se `realizada|pulada|nao_compareceu` e houver `task_id`, marca a tarefa espelho como
  `concluida`.
- `listPendingMeetings()` — reuniões `agendada/remarcada` ordenadas por `scheduled_for`;
  gestor vê conforme a carteira (cookie `cc-carteira`), dev vê só as suas.

### Sincronia tarefa → reunião (2d, aprovado)
Gancho em `updateTaskStatus`: se a task concluída tiver reunião vinculada
(`clinic_meetings.task_id = task.id`), propaga → reunião `realizada` (sem ata).

## Superfícies de UI

- **Aba da clínica** (`src/app/(app)/clinicas/[id]/(abas)/page.tsx`, painel "Meu checklist",
  abaixo de `ClinicOnboardingStatus`): componente novo `ClinicMeetings` (client).
  - Sem `onboarding_started_at`: campo de data + botão *Iniciar onboarding* →
    `startClinicOnboarding`.
  - Com data: timeline dos 3 marcos com data prevista, badge de status e ações por reunião
    (marcar realizada com textarea de ata, remarcar, não compareceu, pular).
- **Dashboard** (`src/app/(app)/page.tsx`), só `role === "gestor"`: card
  "Reuniões de onboarding" listando as pendentes por `scheduled_for`, atrasadas destacadas,
  respeitando o filtro de carteira. Reaproveita `Panel`/`KpiCard`. Fonte: `listPendingMeetings`.
- **Tarefas**: sem UI nova — a tarefa espelho já aparece em `/tarefas` e na agenda
  "Minha semana" pelo `due_date`. Opcional: etiqueta discreta de "reunião de onboarding".
- **Sem menu/rota nova** — tudo pendura em superfícies existentes.

## Tratamento de erros / robustez

- `materializeMeetingTasks()` nunca lança (não pode quebrar dashboard/`/tarefas`).
- Geração idempotente via índice único; corrida concorrente cai em `23505` e é ignorada.
- Data de início editável recalcula só reuniões não realizadas.
- FKs: `clinic_id on delete cascade`; `task_id on delete set null`.
- Permissões: `startClinicOnboarding`/`setMeetingOutcome` exigem sessão;
  `listPendingMeetings` respeita a carteira.

## Testes (`tests/*.test.ts`)

- Lógica pura em `src/lib/clinics/meetings.ts`: `meetingDates(startDate)` e
  `shouldMaterialize(meeting, today)`. Casos: +7/+15/+30 com virada de mês, fuso
  America/Sao_Paulo, janela de antecedência.
- Idempotência: gerar/materializar duas vezes não duplica.
- Sincronia: `setMeetingOutcome(realizada)` conclui a task; concluir a task propaga →
  reunião `realizada`.

## Etapas de entrega (cada uma = doc atualizada + 1 commit; tudo aditivo, não quebra prod)

1. Migration `0059` (coluna + tabela + índices + RLS) — deploy isolado, sem uso ainda.
2. Lógica pura `meetings.ts` + testes.
3. Actions (`meeting-actions.ts`) + materializador.
4. UI da aba da clínica (`ClinicMeetings`).
5. Card do gestor no dashboard.
6. Gancho de sincronia tarefa→reunião + etiqueta opcional.
