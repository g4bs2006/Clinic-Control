# 0007 — `/sistemas` como matriz clínica × sistema

## Contexto

O Clinic Control liga cada clínica a quatro sistemas: **Automação de agendamento**,
**Aniversariantes**, **Dashboard de performance** e **conta Helena**. Cada um foi
parar num lugar diferente conforme quem o construiu:

| Sistema | Visão da carteira | Config por clínica |
|---|---|---|
| Automação | `/configuracoes/automacao` | painel na aba Cadastro |
| Helena | `/helena`, página própria | painel na aba Cadastro |
| Aniversariantes | **não existe** | painel na aba Cadastro |
| DashBoard-s | não existe | **fora do Clinic Control** (`/setup` com senha) |

A força que obriga a decidir agora não é estética, é um número. Em 2026-08-21,
com 61 clínicas ativas:

- **Aniversariantes: 2 configuradas.** Não por falta de dado — para uma clínica
  Clinicorp o formulário abre inteiro pré-preenchido. Ninguém configurou porque
  descobrir *quais* eram elegíveis exigiria abrir 61 abas Cadastro.
- **Dashboard: 24 ativas sem dashboard**, 23 delas com todo pré-requisito pronto.
- **3 dashboards parcialmente configurados** — ingerindo cards sem `_funnel`,
  provavelmente exibindo funil vazio. Invisíveis de qualquer tela.
- **1 clínica arquivada com dashboard ativo** e 1.480 cards ainda sendo ingeridos.

Todos esses fatos foram descobertos por consulta SQL ao escrever este ADR. Nenhum
era observável pela interface. O padrão é claro: **o que não tem visão de
carteira não é operado.**

Um contraexemplo importante desmonta a explicação fácil. O setup do DashBoard-s
mora **fora** do Clinic Control, atrás de senha, e tem 37/61 configuradas. O do
Aniversariantes mora **dentro**, e tem 2/30. Localização não explica adoção —
**visibilidade e responsabilidade explicam.** Trazer telas para dentro do Clinic
Control é bom por dono único e por matar o `ADMIN_SECRET`, não por adoção.

## Decisão

Criar **`/sistemas`**: uma matriz com **uma linha por clínica e uma coluna por
sistema**. A linha responde "o que essa clínica tem"; a coluna responde "quem
falta". A configuração profunda abre em painel lateral sobre a lista, sem
navegar.

Separação semântica com a página vizinha:

- **`/configuracoes`** — regras da plataforma: equipe, funil, IA, tarefas.
- **`/sistemas`** — estado de integração da carteira.

Cada célula tem **quatro** estados, e o quarto é o que sustenta a decisão:

| Estado | Significado |
|---|---|
| **configurado** | pronto |
| **pronta** | elegível, nada a digitar — *é aqui que se age* |
| **parcial** | existe mas incompleto |
| **não se aplica** | o sistema não suporta essa clínica |

Peso visual deliberadamente invertido em relação ao usual: **"configurado" recua
e "pronta" recebe o acento de marca.** A tela existe para agir; maioria verde não
informa nada, e um vazio acionável não deve ser mais discreto que um sucesso.

## Consequências

**Fica mais difícil:**

- **Cada sistema novo é uma coluna, e colunas não escalam.** Quatro cabem; dez
  não. O dia em que um quinto sistema aparecer, a decisão precisa ser revisitada
  em vez de acomodada — matriz larga com scroll horizontal é o modo de falha.
- **O estado de cada célula precisa ser derivável em uma query.** Isso amarra
  `/sistemas` à forma dos dados: hoje `dashboards.clinics.steps ? '_funnel'` é o
  que define "parcial" no Dashboard. Se o formato do JSONB mudar, a coluna mente
  em silêncio. Vale um teste que falhe quando a derivação parar de valer.
- **Dois lugares falam do mesmo estado.** A aba Cadastro passa a mostrar uma
  faixa compacta de status (não os painéis de configuração), e ela pode divergir
  da matriz se as duas derivarem o estado por caminhos diferentes. Devem
  compartilhar a mesma função.

**Fica mais fácil:**

- O contador por coluna (`2/30`) é o número que faz alguém agir. Foi ele que
  expôs os quatro problemas acima.
- Ordenar/filtrar pela coluna dá a visão "por sistema" sem tela adicional.
- Estados que hoje não existem em lugar nenhum — "parcial", "arquivada com
  sistema ativo" — passam a ter onde aparecer.

### Alternativas recusadas

**Uma aba por sistema em `/sistemas`.** Foi a primeira proposta. Recusada porque
força quatro consultas para responder "o que essa clínica tem" — a pergunta mais
frequente quando alguém está numa ligação sobre uma clínica. A matriz responde as
duas leituras no mesmo espaço de tela, e o clique no cabeçalho da coluna recupera
a visão por sistema de graça.

**Campo de "produtos contratados" na ficha da clínica.** Chegou a ser proposto
para distinguir "esqueceram de configurar" de "esse cliente não comprou". Recusado
porque **todas as clínicas terão dashboard** — então `✕` é sempre pendência real,
e o campo não teria consumidor. Criar campo de contrato só para alimentar uma
coluna seria a cauda abanando o cachorro.

**Manter tudo na aba Cadastro.** É o status quo, e é o que produziu 2/30. A aba
já acumula ficha, detalhes, anotações, arquivos e quatro painéis de integração —
um empilhado que mistura "dados da clínica" com "sistemas da clínica".

**Três estados em vez de quatro.** Recusado com número: das 61 ativas, só 30 são
elegíveis para Aniversariantes (o app integra apenas com Clinicorp e e-Clínica).
Sem "não se aplica", **metade da coluna seria falso alarme** — e em duas semanas
ninguém olharia mais. O quarto estado não é refinamento, é o que mantém a tela
confiável.

**Lista global própria para o Aniversariantes.** Era a forma original da #82.
Absorvida como uma coluna desta matriz: uma tela por sistema reproduziria a
fragmentação que este ADR existe para resolver.

## Status

**Aceito** — 2026-08-21. Validado em mockup com os dados reais das 61 clínicas
ativas antes de escrever código.

Implementação incremental, nesta ordem: (1) matriz com as colunas Automação
(move a visão que já existe em `/configuracoes/automacao`) e Aniversariantes
(#82); (2) coluna Dashboard quando a #70 trouxer o wizard para dentro;
(3) absorver `/helena` por último, que é a de maior UI própria e menor ganho.

Ver [0001](0001-banco-unico-compartilhado.md) para por que os sistemas vivem em
schemas separados do mesmo banco, e [0003](0003-sem-painel-para-cliente-final.md)
para por que nada disso é exposto ao cliente final.
