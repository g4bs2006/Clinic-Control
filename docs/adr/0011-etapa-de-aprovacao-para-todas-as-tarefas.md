# 0011 — Etapa de aprovação para todas as tarefas, board único

- **Status:** Aceito
- **Registrado em:** 2026-08-27
- **Substitui:** [0010](0010-etapa-de-aprovacao-para-tarefas-internas.md) (decisões 1, 2 e 3)

## Contexto

O 0010 criou a etapa "Em aprovação" **só para tarefas internas** e recusou
explicitamente estender a regra às tarefas de clínica: "o pedido era só sobre o
trabalho interno; aplicar a tarefas de clínica adicionaria fricção sem
necessidade". O time voltou atrás uma semana depois — o pedido agora é que as
tarefas das clínicas e o Kanban sigam o mesmo padrão das internas.

O que mudou de fato não foi a leitura do custo, foi o objetivo: o 0010 tratava
a aprovação como um controle sobre o trabalho interno; agora ela é entendida
como o fecho padrão de qualquer tarefa. A fricção que o 0010 recusou continua
existindo (ver Consequências) — passou a ser aceita de propósito.

O segundo efeito era o custo escondido do 0010: a regra "quem pode concluir"
ficou ramificada por `is_internal` em cinco lugares (Lista, Kanban, detalhe,
subtarefa, formulário) e o Kanban ganhou dois desenhos — 3 colunas na aba
"Internas", 5 nas outras. Duas formas do mesmo board, divergindo por escopo.

## Decisão

1. **`em_aprovacao` vale para qualquer tarefa.** A constraint
   `tasks_em_aprovacao_requires_internal` (0089) é dropada na `0091`. O conjunto
   de status não muda — muda quem pode assumir `em_aprovacao`.
   `tasks_status_check` continua valendo. A migration só **abre** o domínio,
   então é segura com o código antigo no ar (não precisa de duas fases como o
   0086/0087).
2. **Só gestor conclui — qualquer tarefa, qualquer tela.** O gate de
   `requireGestor()` em `updateTaskStatus`, `bulkUpdateTaskStatus`, `createTask`
   e `createTasksForClinics` perde a condição `is_internal`. A trava segue no
   servidor; a UI só deixa de oferecer o que seria recusado.
3. **Um board só, de trabalho aberto.** O Kanban mostra Pendente / Em andamento
   / Em aprovação nas **três** abas de escopo (ADR 0009). Concluída e Cancelada
   deixam de ser colunas — encerrar é o botão "Concluir" no card (manda pra
   revisão) e "Aprovar", só para gestor. O que está fechado se vê no Histórico.
   `KanbanBoard` perde o prop `scope`.
4. **A regra ganha um lar: `src/lib/tasks/approval.ts`.** `KANBAN_STATUSES`,
   `needsApproval`, `concludeTarget` e `statusOptions` — lidos pelas cinco
   telas. Enquanto a regra era ramificada por natureza, a lógica inline em cada
   tela se defendia; com um fluxo único ela é uma regra de negócio só, e
   duplicá-la cinco vezes é como o próximo filtro nasce divergente.
5. **`is_internal` continua existindo, com o papel do ADR 0009**: separar a
   navegação (rotas/abas), o recorte no servidor e o selo no card. O que ela
   deixa de decidir é o *fluxo de conclusão*.

### Alternativas recusadas

**Aprovação para clínicas, mas qualquer um aprova.** Manteria a autonomia de
quem atende a clínica e ainda daria o passo de revisão. Recusada por criar dois
significados para a mesma coluna — "aguardando gestor" nas internas,
"aguardando qualquer um" nas de clínica —, o tipo de sutileza que ninguém lembra
seis meses depois. Fica registrada como o ajuste natural se o gargalo do gestor
(ver Consequências) apertar.

**Board enxuto sem etapa de aprovação** (Kanban de 2 colunas, conclui direto).
Entregaria a limpeza visual sem mexer em permissão nem em banco, mas não é o
padrão das internas — o pedido era o fluxo, não só o visual.

**Manter as 5 colunas na aba "Todas".** Útil pra revisar o que foi fechado sem
ir ao Histórico, mas deixaria o board com dois desenhos — exatamente a
divergência que esta decisão vem remover.

## Consequências

- **O gestor vira gargalo do dia a dia das clínicas.** Antes, quem atendia
  fechava a própria tarefa; agora toda conclusão espera revisão. É o custo que
  o 0010 recusou e que aqui é aceito de propósito. O sintoma a observar é
  acúmulo na coluna "Em aprovação"; a saída registrada é a primeira alternativa
  recusada acima.
- Leituras de "tarefa aberta" **precisam** incluir `em_aprovacao` — agora para
  qualquer base, não só as que podem conter internas. Já cobertos antes desta
  decisão: `notify_task_due` (0090), Panorama, Ctrl+K, anti-empilhamento de
  recorrências, bloqueio por dependência. **Três lugares só estavam corretos
  porque o status era exclusivo de internas** e foram ajustados aqui:
  `expand_pendencias_to_suggestions` (migration `0092` — filtrava por
  `clinic_id`, então uma tarefa de clínica em revisão contaria como inexistente
  e a pendência voltaria pra fila de sugestões), `countMyPendingTasks` (widget
  da home) e o resumo da manhã na Edge Function `notify`. É a categoria de erro
  que o 0010 já apontava como a mais provável — e ela se materializou onde o
  recorte era por clínica.
- Nenhuma tarefa de clínica concluída muda de status: a mudança é só de caminho
  daqui pra frente. Não há migração de dados.
- No Kanban, filtrar por status "Concluída" ou ligar "Mostrar concluídas" não
  tem efeito visível — não existe coluna pra receber. Quem quer ver fechado
  troca para Histórico.
- Se a aprovação precisar de níveis (dois gestores), a evolução continua sendo
  qualificar `em_aprovacao` com quem aprovou, não criar status por nível
  (herdado do 0010).

## Ver também

- [0010](0010-etapa-de-aprovacao-para-tarefas-internas.md) — a decisão que este
  substitui em parte; lá está a versão restrita a internas e o motivo original
  da recusa.
- [0009](0009-separacao-tarefas-internas-e-de-clinicas.md) — a flag
  `is_internal`, que continua valendo para navegação e recorte, só não decide
  mais o fluxo.
- [0008](0008-responsaveis-multiplos-e-dependencias-entre-tarefas.md) —
  bloqueio por dependência, que já cobria `em_aprovacao`.
