# 0003 — Não construir painel para o cliente final

- **Status:** Aceito
- **Registrado em:** 2026-08-18 (decisão registrada no ROADMAP em julho/2026)

## Contexto

Dar à própria clínica acesso a um painel com seus números é um pedido natural e
comercialmente atraente. A pergunta é o que ele exigiria do modelo de dados.

Hoje o Clinic Control opera sob a premissa de que **todo usuário autenticado é
staff confiável**: não há isolamento por tenant no banco, e o
[0001](0001-banco-unico-compartilhado.md) reforça isso — um único schema
`public` compartilhado entre dois apps, sem RLS por clínica.

## Decisão

Não construir painel para o cliente final por ora.

## Consequências

- Abrir isso depois exige **isolamento real de dados** — RLS por clínica em
  todas as tabelas, revisão de cada query e de cada Edge Function. É um projeto,
  não uma tela.
- Em troca, todo o desenvolvimento atual pode assumir acesso total ao banco, o
  que simplifica queries, agregações de carteira e os crons.
- **Se este ADR for revertido, ele precisa ser revertido antes do código** — não
  depois. Descobrir a necessidade de RLS com 80 tabelas e 4 crons em produção é
  a versão caríssima desta decisão.
