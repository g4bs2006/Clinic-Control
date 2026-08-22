# Documentação do Clinic Control

A pasta é organizada por **função do texto**, não por assunto — convenção
[Diátaxis](https://diataxis.fr). O motivo: um mesmo assunto (deploy, por
exemplo) precisa de textos diferentes quando você quer *aprender*, *executar*,
*consultar* ou *entender*. Misturar os quatro num arquivo é o que faz ninguém
achar nada.

| Pasta | Responde | Escrita como |
|---|---|---|
| [`how-to/`](how-to/) | "como eu faço X?" | receita, passo a passo, para quem já sabe o contexto |
| [`reference/`](reference/) | "qual é o parâmetro/campo/endpoint?" | descrição seca, consultável, sem narrativa |
| [`adr/`](adr/) | "por que é assim?" | decisão, alternativas recusadas, consequências |
| [`historico/`](historico/) | "como chegamos aqui?" | congelado, não se atualiza |

## O que está onde

- **[`adr/`](adr/)** — as 7 decisões de arquitetura que sustentam o sistema.
  Comece pela [0001](adr/0001-banco-unico-compartilhado.md): o banco único
  compartilhado com o Aniversariantes explica boa parte das restrições do resto.
- **[`reference/helena-api/`](reference/helena-api/)** — 128 páginas da API
  Helena (Chat, CRM, Core), a referência externa mais consultada do projeto.
- **[`reference/schema-aniversariantes.md`](reference/schema-aniversariantes.md)** —
  contrato das tabelas que este repo consome mas não versiona. Leitura obrigatória
  antes de mexer em qualquer coisa do Aniversariantes.
- **[`how-to/migracao-schemas-por-app.md`](how-to/migracao-schemas-por-app.md)** —
  runbook da migração que tira o Aniversariantes e o DashBoard-s do schema
  `public`. Tem passos que só podem ser feitos à mão e uma ordem que, invertida,
  derruba os três apps — ler antes de aplicar a `0082`/`0083`.
- **[`reference/n8n/`](reference/n8n/)** — workflows do n8n. Ver o
  `DEPRECATED.md` antes de reutilizar: a coleta migrou para Edge Function.
- **[`historico/`](historico/)** — `fase-1.md` e os planos em `superpowers/`,
  que registram as fases de construção. Documento morto por definição: descreve
  o que foi feito, não o que vale hoje.

## Fora desta pasta, de propósito

Documentação que precisa ficar ao lado do que ela descreve, senão desatualiza:

| Arquivo | Conteúdo |
|---|---|
| [`../README.md`](../README.md) | visão geral, stack, como rodar local |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | como o trabalho é organizado — fluxo, branches, labels, WIP |
| [`../ROADMAP.md`](../ROADMAP.md) | norte estratégico e frentes (o *porquê*; o *o quê/quando* vive no Project) |
| [`../deploy/README.md`](../deploy/README.md) | runbook da VPS — o how-to mais crítico que existe |
| [`../supabase/dump/migration-notes.md`](../supabase/dump/migration-notes.md) | notas de migração do banco |
