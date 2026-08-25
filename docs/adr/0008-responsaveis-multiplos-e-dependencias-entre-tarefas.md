# 0008 — Responsáveis múltiplos e dependências entre tarefas

- **Status:** Aceito
- **Registrado em:** 2026-08-24

## Contexto

Duas lacunas nas tarefas nativas, uma pedida direto pela operação e outra
registrada como débito desde o ADR [0004](0004-tarefas-nativas-em-vez-do-clickup.md):

1. **Um único responsável.** `tasks.assigned_to` é uma FK única — uma tarefa
   que envolve duas pessoas (ex.: dev da carteira + gestor revisando) não tem
   como refletir isso, só "escolher um dono e comentar que o outro também está
   envolvido".
2. **Dependências entre tarefas.** O ADR 0004 já listava isso como o "último
   item que ainda prende alguém ao ClickUp". O ROADMAP tem a épico #33 aberta
   com três sub-issues (#34 migration, #35 lógica de bloqueio, #36 UI) desde
   antes deste ADR — nenhuma tinha decisão de design registrada.

## Decisão

### Responsáveis: lista plana, sem "principal"

`task_assignees` (task_id, user_id) substitui `assigned_to` por completo —
migration `0084` faz o backfill e **derruba a coluna**. Todo mundo na lista é
igualmente responsável. Escopo de carteira, notificação de atribuição,
contagem de "minhas pendentes" e o resumo diário por WhatsApp
(`supabase/functions/notify`) passam a checar pertencimento na lista em vez de
comparar uma coluna.

`task_recurrences.assigned_to` **não muda** — a regra recorrente continua com
um responsável fixo (ou o dev da carteira, no fan-out por clínica); é a
*ocorrência* materializada que nasce com esse responsável já em
`task_assignees`. Multi-responsável na regra em si ficou fora de escopo (não
foi pedido).

### Dependências: N:N, bloqueio rígido, ciclo validado na action

`task_dependencies` (migration `0085`) relaciona tarefa bloqueada →
bloqueadora, N:N. Duas decisões que as sub-issues abertas deixavam em aberto:

- **Bloqueio é RÍGIDO.** `updateTaskStatus`/`bulkUpdateTaskStatus` recusam
  mover para "em andamento" ou "concluída" enquanto houver bloqueadora aberta
  — erro, não aviso. Em lote, recusa o lote inteiro (o usuário reseleciona sem
  as bloqueadas) em vez de aplicar parcial.
- **Ciclo indireto (A bloqueada por B bloqueada por A) é validado na action**
  (`addDependency` faz um BFS no grafo de dependências antes de inserir), não
  no banco — só o ciclo direto (`check (task_id <> depends_on_task_id)`) vale
  como constraint. Ciclo de N tarefas não é expressável num CHECK simples.
- **Vale só para a própria tarefa**, não se propaga para subtarefas
  (`parent_task_id` é um eixo separado, como já era antes desta feature).

## Consequências

**Fica mais difícil:**

- `task_assignees` toca escopo de carteira, notificações, filtros, dashboard e
  o resumo por WhatsApp — ~15 arquivos mudaram juntos. Qualquer leitura nova de
  "quem é responsável por uma tarefa" precisa lembrar que é uma lista, não um
  campo.
- O bloqueio rígido significa que uma tarefa pode ficar "presa" em pendente se
  a bloqueadora nunca for resolvida — não há botão de "forçar" na versão 1.
  Se isso virar reclamação recorrente, a alternativa registrada abaixo
  ("aviso, mas permite") é a próxima a considerar.
- O resumo diário por WhatsApp (`notify/index.ts`) agora conta uma tarefa sem
  clínica em CADA carteira de responsável quando ela tem mais de um — a soma
  dos totais por dev pode passar do total real de tarefas abertas. Aceito
  conscientemente: o resumo é "o que sobra pra cada um ver", não uma
  contagem contábil.

**Fica mais fácil:**

- Notificação de atribuição, filtro por responsável e "minhas pendentes" já
  nascem corretos para qualquer número de responsáveis — nenhum desses lugares
  tem lógica de "só o primeiro" escondida.
- A UI de dependências (chips + busca, em `dependency-picker.tsx`) é reutilizável
  fora do detalhe de tarefa se `/tarefas` ganhar uma visão de grafo no futuro.

### Alternativas recusadas

**Principal + colaboradores** (um `assigned_to` continua existindo como "dono"
e uma tabela à parte guarda colaboradores extras, só notificados). Recusada
por criar dois conceitos de responsável para manter — o pedido original era
"mais de um dev responsável", não "um dono e uns avisados".

**Aviso, mas permite** (mostrar as dependências abertas num `confirm()` e
deixar prosseguir mesmo assim). Recusada para a v1: a regra viraria sugestão,
e o objetivo explícito era fechar a lacuna que ainda manda gente de volta ao
ClickUp. Fica registrada como a válvula de escape se o bloqueio rígido
incomodar na prática.

**Bloqueio herdado por subtarefas.** Recusado por simetria com o resto do
modelo — `parent_task_id` já não interage com nenhuma outra regra (prioridade,
notificação, recorrência) hoje, e dependências não seriam a exceção.

## Ver também

[0004](0004-tarefas-nativas-em-vez-do-clickup.md) registrou a lacuna de
dependências como débito consciente ao reimplementar o ClickUp.
