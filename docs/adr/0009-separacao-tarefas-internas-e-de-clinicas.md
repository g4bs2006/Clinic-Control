# 0009 — Separação de tarefas internas e tarefas das clínicas

- **Status:** Aceito
- **Registrado em:** 2026-08-25

## Contexto

As tarefas nativas misturam duas naturezas numa lista só: trabalho da operação
interna da Contact.IA ("revisar o relatório", "rodar a rotação da service key")
e trabalho de uma clínica específica ("cobrar o relatório da Salutar"). O time
pediu para separar as duas na navegação: o item "Tarefas" da sidebar passa a
oferecer "Tarefas internas" e "Tarefas das clínicas".

Antes desta decisão a natureza da tarefa era **deduzida** de `clinic_id IS
NULL` — uma convenção espalhada pelo código (filtro "Sem clínica",
`createTasksForClinics` sem clínicas selecionadas, rótulo "Sem clínica" do
dashboard) e nunca declarada como conceito de negócio.

## Decisão

1. **Flag explícita com espelho por constraints.** `tasks.is_internal boolean
   not null default false`, com backfill (`clinic_id IS NULL` → interna) e duas
   CHECK constraints que garantem o espelho: interna ⇔ sem clínica; tarefa de
   clínica ⇔ com clínica. O código e a UI leem um campo de negócio com nome
   próprio; o banco impede os dois campos de discordarem. Se um dia "interna
   com contexto de clínica" for pedida, a evolução é dropar
   `tasks_internal_requires_no_clinic` — migration de uma linha, sem reescrever
   dados.
   **Aplicação em duas fases** (zero janela de quebra): `0086` só adiciona a
   coluna e faz o backfill (segura com código antigo ou novo no ar); `0087`,
   aplicada depois do deploy do código que escreve o campo, re-fixa as linhas
   do intervalo e só então adiciona as constraints — na ordem inversa, o código
   antigo quebraria ao criar tarefa sem clínica e o novo quebraria antes de a
   coluna existir.
2. **Rotas próprias, não query param.** `/tarefas` continua sendo "Todas";
   `/tarefas/clinicas` e `/tarefas/internas` são rotas com escopo. Um
   `?escopo=` brigaria com o filtro persistido em localStorage e deep-linka
   pior. O detalhe `/tarefas/[id]` continua vencendo (segmento estático tem
   precedência sobre o dinâmico).
3. **Escopo no servidor e em todas as views.** `listTasks(scope)` aplica
   `.eq("is_internal", …)` na base da query, compondo com o escopo de carteira
   (dev em "internas" vê só as internas atribuídas a ele; gestor vê tudo do
   escopo). Lista, Board, Panorama, Agenda e Histórico respeitam o escopo —
   sem exceção por view.
4. **Sidebar**: "Tarefas" continua clicável (Todas) e ganha dois sub-itens
   quando a sidebar está aberta; a paleta Ctrl+K lista os filhos como entradas.
   O filtro de clínica se adapta ao escopo (some em internas; a opção "Sem
   clínica" some em clínicas) e o filtro persistido é saneado ao entrar na rota
   (evita lista vazia sem explicação).

### Alternativas recusadas

**Filtro só no cliente.** Barato, mas não atende o pedido (separação na
navegação) e mantém a natureza da tarefa invisível para qualquer outra leitura.

**Flag independente (interna pode referenciar uma clínica).** Mais expressiva,
mas cria um terceiro estado sem regra definida — a interna com clínica aparece
no perfil da clínica? No resumo do WhatsApp? — custo de UI e testes sem pedido
que o justifique. Fica registrada como a evolução natural se o pedido vier.

## Consequências

- Leituras novas de "qual a natureza desta tarefa" usam `is_internal`, não
  `clinic_id IS NULL` — o espelho torna os dois equivalentes hoje.
- `createTask`/`updateTask`/`acceptTaskSuggestion` validam o toggle contra o
  espelho (ligar interna zera a clínica; desligar exige clínica).
- `notify` e o dashboard não mudam (continuam lendo `clinic_id`), protegidos
  pela constraint.
- A UI de criação ganha um toggle "Tarefa interna" que desabilita o seletor de
  clínica — a escolha vira explícita em vez de efeito colateral de não escolher
  clínica.

## Ver também

- [0008](0008-responsaveis-multiplos-e-dependencias-entre-tarefas.md) — mesma
  área, mesma época: lá a lista plana de responsáveis substituiu o campo único.
- [0004](0004-tarefas-nativas-em-vez-do-clickup.md) — origem das tarefas
  nativas.
