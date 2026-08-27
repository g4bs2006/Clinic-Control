# 0010 — Etapa de aprovação para tarefas internas

- **Status:** Substituído em parte por [0011](0011-etapa-de-aprovacao-para-todas-as-tarefas.md)
- **Registrado em:** 2026-08-26

## Contexto

O fluxo de tarefas tinha um único caminho de conclusão —
`pendente → em_andamento → concluida` (+ `cancelada` como saída lateral) —
igual para tarefas internas da operação e tarefas de clínica. O time pediu
uma etapa de revisão para o trabalho interno: antes de dar por encerrada,
um gestor confirma. Tarefa de clínica não precisa disso — segue exatamente
como antes.

No Kanban, a coluna "Concluída" também deixava de fazer sentido para
internas: virar o card na coluna final é um gesto silencioso, sem garantir
que alguém revisou. O pedido foi trocar por um botão explícito "Concluir"
que manda para revisão, mantendo a coluna final fora do board.

## Decisão

1. **Novo status `em_aprovacao`, restrito a tarefas internas.** Entra entre
   "em andamento" e "concluída". Uma constraint (`tasks_em_aprovacao_requires_internal`)
   trava no banco que só `is_internal = true` pode estar nesse status — mesmo
   espírito das constraints de espelho do ADR 0009. Tarefa de clínica nunca
   assume esse valor.
2. **Só gestor conclui tarefa interna — em qualquer tela.** `updateTaskStatus`,
   `bulkUpdateTaskStatus`, `createTask` e `createTasksForClinics` recusam
   `status = "concluida"` numa tarefa/criação interna quando quem pede não é
   gestor (`requireGestor()`, já usado em `recurrence-actions.ts`). A trava é
   no servidor — Lista, Kanban, diálogo de detalhe, ação em lote e subtarefas
   herdam o mesmo comportamento sem lógica duplicada. Tarefa de clínica nunca
   passa por esse gate.
3. **Kanban da aba "Internas" perde as colunas Concluída/Cancelada.** Mostra
   só Pendente / Em andamento / Em aprovação; cada card ganha um botão
   "Concluir" que manda para `em_aprovacao` (para qualquer papel) e, quando
   já está lá, um botão "Aprovar" visível só para gestor. Nas abas "Todas" e
   "Clínicas" o board continua com todas as colunas, sem os botões novos —
   tarefa de clínica conclui direto, como sempre.
4. **Bloqueio por dependência (ADR 0008) se estende a `em_aprovacao`.** Uma
   tarefa bloqueada não avança nem para revisão, mesma regra que já valia
   para "em andamento"/"concluída".
5. **Uma tarefa "em aprovação" continua contando como aberta** para prazo
   (`notify_task_due`), Panorama, busca (Ctrl+K) e anti-empilhamento de
   recorrências — só deixa de contar como pendência quando o gestor aprova.

### Alternativas recusadas

**Etapa de aprovação para todas as tarefas.** Mais uniforme, mas o pedido era
só sobre o trabalho interno; aplicar a tarefas de clínica adicionaria fricção
sem necessidade e mudaria um fluxo que já funciona bem para quem atende as
clínicas.

**Trava só no botão do Kanban.** Mais simples de implementar, mas deixaria a
Lista, a ação em lote e o diálogo de detalhe concluindo tarefa interna direto
— a aprovação viraria um passo opcional, contornável, não uma trava de
verdade.

## Consequências

- Leituras novas de "essa tarefa está aberta" precisam incluir
  `em_aprovacao` ao lado de `pendente`/`em_andamento` quando a base pode
  conter tarefas internas — omitir é o erro mais provável (times de suporte,
  filtros novos).
- A UI de criação e edição de tarefa interna esconde a opção "Concluída" do
  select de status para quem não é gestor — evita uma escolha que o servidor
  recusaria.
- Se um dia a aprovação precisar de mais de um nível (ex.: dois gestores),
  a evolução natural é qualificar `em_aprovacao` com quem aprovou, não criar
  um status novo por nível.

## Emenda (2026-08-27)

As decisões 1, 2 e 3 foram substituídas pelo
[0011](0011-etapa-de-aprovacao-para-todas-as-tarefas.md): a etapa "Em aprovação"
passa a valer para **todas** as tarefas (a constraint
`tasks_em_aprovacao_requires_internal` cai na `0091`), o gate de gestor perde a
condição `is_internal`, e o Kanban de 3 colunas vira o board único das três
abas. Ou seja: a alternativa recusada aqui — "Etapa de aprovação para todas as
tarefas" — foi adotada. O motivo da recusa (fricção para quem atende as
clínicas) não foi refutado; passou a ser um custo aceito, e está registrado nas
Consequências do 0011 junto com o sinal que indicaria voltar atrás.

As decisões 4 (bloqueio por dependência cobrindo `em_aprovacao`) e 5 ("em
aprovação" conta como aberta) continuam valendo sem mudança.

## Ver também

- [0011](0011-etapa-de-aprovacao-para-todas-as-tarefas.md) — estende esta
  decisão a todas as tarefas e unifica o board.
- [0009](0009-separacao-tarefas-internas-e-de-clinicas.md) — a flag
  `is_internal` que esta decisão usa para restringir `em_aprovacao`.
- [0008](0008-responsaveis-multiplos-e-dependencias-entre-tarefas.md) —
  bloqueio rígido por dependência, estendido aqui para cobrir "em aprovação".
