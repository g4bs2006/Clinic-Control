# Decisões de arquitetura (ADR)

Um ADR registra uma escolha técnica que **tinha alternativas reais** e que
alguém — talvez você mesmo, em seis meses — vai questionar. Não documenta como
o código funciona (isso é `reference/`); documenta **por que ele é assim**.

Escreva um quando: houver mais de uma opção defensável, a escolha for custosa de
reverter, ou você tiver *recusado* algo por um motivo que não fica visível no
código. A decisão recusada é a mais valiosa de todas — o código só registra o
que foi feito, nunca o que foi descartado e por quê.

## Formato

Quatro seções, nesta ordem: **Contexto** (que força obriga a decidir agora),
**Decisão** (uma frase no presente do indicativo), **Consequências** (o que fica
mais difícil depois — a parte que o futuro lê) e **Status**.

Status possíveis: `Proposto` · `Aceito` · `Substituído por 00XX` · `Revertido`.
ADR não se apaga nem se reescreve: se a decisão muda, cria-se um novo que
substitui o antigo. O histórico das reviravoltas é o conteúdo (ver o 0002).

Numeração sequencial, nunca reaproveitada. Arquivo: `00XX-titulo-em-kebab.md`.

## Índice

| # | Decisão | Status |
|---|---|---|
| [0001](0001-banco-unico-compartilhado.md) | Um projeto Supabase para os dois apps, em schemas separados | Aceito |
| [0002](0002-vps-hostinger-em-vez-de-vercel.md) | Hospedar na VPS Hostinger em vez da Vercel | Aceito |
| [0003](0003-sem-painel-para-cliente-final.md) | Não construir painel para o cliente final | Aceito |
| [0004](0004-tarefas-nativas-em-vez-do-clickup.md) | Tarefas nativas para substituir o ClickUp | Aceito |
| [0005](0005-deepseek-como-provedor-de-llm.md) | DeepSeek como provedor de LLM | Aceito |
| [0006](0006-dono-unico-das-migrations.md) | Tornar rastreável a dependência de schema entre os repos | Proposto |
