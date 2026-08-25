# Roadmap — Clinic Control

_Última atualização: 2026-08-20_

> **O acompanhamento do dia a dia vive no [Project](https://github.com/users/g4bs2006/projects)**, não aqui.
> Este arquivo guarda o *porquê* — norte estratégico, frentes e o que foi descartado.
> O *o quê / quando* são as issues. Como o trabalho flui: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Norte estratégico

Transformar o Clinic Control de "painel que a equipe consulta" em **central de operação que puxa a equipe para a ação**, unificando a gestão da carteira de clínicas e substituindo ferramentas dispersas (planilhas, ClickUp, grupos de WhatsApp, CRM).

Quatro frentes (revisado em 2026-08-20 — eram três; notificações e proatividade cresceram escopo o suficiente pra separar identidade/integração em frentes próprias):

```
detecta (proatividade) → vira tarefa (núcleo operacional) → notifica (agente) → equipe age → rastreia
```

1. **Núcleo operacional** (era "Matar o ClickUp") — tarefas nativas, dependências entre tarefas, calendário/reuniões v1. _(frente atual)_
   - Critério de saída: fecha quando **Dependências entre tarefas** e **Calendário v1** estiverem em produção.
2. **Agente & Notificações** — identidade por número de WhatsApp (com fluxo de troca de número verificado), push individualizado por dono de clínica, agente conversacional sob demanda.
3. **Integrações externas** — OAuth por usuário e sync com serviços de terceiros (Google Calendar primeiro; infra pensada pra servir integrações futuras).
4. **Observabilidade & Proatividade** — dashboard de erros de automação (n8n) com triagem por IA, churn preditivo, padrões entre clínicas.

Regra de WIP entre frentes não muda: **uma frente ativa por vez**, WIP de 2 itens em "Fazendo" no total continua sendo o limitador real de quanto trabalho corre em paralelo — mais frentes é só granularidade de categorização, não licença pra rodar tudo ao mesmo tempo.

Descartado por ora: painel para o cliente final — ver [ADR 0003](docs/adr/0003-sem-painel-para-cliente-final.md).

Infra: **VPS Hostinger** (container atrás do nginx da stack `contactia`, auto-deploy do `main` via GitHub Actions) + **Supabase** (banco, storage, Edge Functions e todos os crons). Saímos da Vercel em 2026-07-29 — a decisão e as responsabilidades que ela transferiu para nós estão no [ADR 0002](docs/adr/0002-vps-hostinger-em-vez-de-vercel.md).

---

## Concluído recentemente (julho/2026)

- **Anotações e detalhes da clínica** (migration `0078`) — o contexto que se perdia em conversa solta agora vive na aba Cadastro. `clinic_notes`: texto corrido com autor, fixável (mesmo eixo do pin de tarefa) e **privado por anotação** — a mesma pessoa escreve recado para o time e rascunho só dela. `clinic_details`: campos livres chave/valor como extensão da Ficha, com autocomplete dos rótulos já usados em outras clínicas (sem isso o mesmo dado vira "Horário contato" aqui e "Horário de contato" ali, e a comparação entre clínicas morre). Sem RLS no app, a privacidade é regra de servidor (`canViewNote`/`canEditNote`), e um trigger apaga as privadas quando o autor é excluído — `on delete set null` deixaria linha privada sem dono, invisível e imortal.
- **Agenda "Minha semana"** — 3º modo em /tarefas com as tarefas do usuário agrupadas por prazo (Atrasadas, Hoje, Esta semana, Mais tarde, Sem prazo).
- **Seleção múltipla + ação em lote** — na lista de tarefas e na fila de sugestões da IA (confirmar/descartar várias de uma vez).
- **Ciclo de vida das tarefas concluídas** — Lista esconde concluídas/canceladas por padrão (toggle "mostrar concluídas"); arquivamento automático das que passam de 7 dias (coluna `archived_at` + cron diário `archive-done-tasks-daily`), preservando o histórico.
- **Board reativo (UI otimista)** — arrastar/mudar status reflete na hora, sem recarregar a página.
- **Melhorias nos resumos de IA** — comparação com o dia anterior (continuidade), severidade que define a prioridade da tarefa, deduplicação de sugestões (`pg_trgm`).
- **Custo de IA** — log de consumo de tokens (`ai_usage_log`) + card de custo estimado em Configurações.
- **Sincronização on-demand de grupos** — botão para coletar grupos novos sem esperar o cron.
- **Endurecimento de segurança** — rate limit de login (`login_attempts`), proteção contra enumeração por timing, senhas temporárias fortes, gates de autenticação nas ações de clínica.

---

## Frente atual: núcleo operacional

- [x] Agenda "Minha semana" (visão pessoal por prazo)
- [x] Seleção múltipla e ação em lote (lista + sugestões)
- [x] **Tarefas recorrentes** — regras declarativas com materialização lazy, anti-empilhamento e fan-out por carteira; detector de rotinas e diagnóstico pós-onboarding.
- [x] **Responsáveis múltiplos** — `task_assignees` substitui o `assigned_to` único; lista plana, todos igualmente responsáveis (ADR 0008).
- [x] **Dependências entre tarefas** — "bloqueada por"; `task_dependencies` (N:N) + UI de busca/chips no detalhe + bloqueio rígido no `updateTaskStatus`/`bulkUpdateTaskStatus`. Épico: #33 (ADR 0008).
- [ ] **Separação: tarefas internas × das clínicas** — flag `tasks.is_internal` (espelho com constraints, migrations 0086/0087), rotas `/tarefas/clinicas` e `/tarefas/internas` na sidebar, toggle no formulário (ADR 0009).
- [ ] **Calendário v1 (motor interno)** — reuniões/eventos/compromissos, avaliando reaproveitar o motor de recorrência de tarefas. Épico: #37. Sync com Google Calendar é v2, na frente Integrações externas (#56, #59).
- [ ] **Lembretes externos de prazo** — depende da frente Agente & Notificações (a "Minha semana" já cobre o aviso in-app).

---

## Curto prazo

| Item | Observação |
|---|---|
| Rollup semanal por IA | Consolidado semanal; volume de dados já suficiente para executar. |
| Pendências operacionais (`CRON_SECRET` do collect-groups, `DEEPSEEK_API_KEY` na VPS, rotação da service key) | Sem dependência técnica, só execução. |
| Dívida técnica: `max_tokens` fixo em 600 nas subtarefas por IA | Mesmo risco do bug corrigido na migration 0077 (resposta vazia em modelo de raciocínio) se um dia trocarem de modelo. |
| Dívida técnica: base URL fixa no re-disparo de `/api/reports/process` | — |
| Segurança: mensagem de erro genérica da Helena ao cliente | — |
| Investigar/remover instrução suspeita em `AGENTS.md` | Conteúdo não corresponde a nenhum comportamento real do Next.js — provável injeção. |

## Médio prazo

| Item | Observação |
|---|---|
| Identidade por número de WhatsApp (com troca de número verificada) | Base da frente Agente & Notificações. Épico #41, ADR #42. |
| Push individualizado por dono de clínica | Substitui o broadcast único de grupo. Depende da identidade acima. Épico #46. |
| Agente conversacional sob demanda (resumo de clínica, pendências do dia) | v2 da frente Agente & Notificações, depende do push v1. Épico #50. |
| Timeline de sentimento (30 dias) | Aguarda decisão de provedor de embeddings/IA (mesma trava da detecção de padrões, longo prazo). |
| Anotações na busca global — fase 2 | Indexar `clinic_notes` em `global-search.tsx`, **só as compartilhadas**. Ficou fora da primeira rodada de propósito: a busca é outra camada de leitura, e é exatamente onde o filtro de autor é esquecido e a privada vaza. |
| Relatório de conversas — Fase 2/3 | Abas IA×Humano / Habilidades / Mensagens, keywords por clínica e funil na tela. |
| OAuth Google Calendar + sync unidirecional | Frente Integrações externas. ADR #55, épicos #56 e #59. |
| Dashboard de erros do n8n | Frente Observabilidade & Proatividade. Épico #62. Base necessária antes da triagem por IA. |
| Categorização automática de pendência | Sugerir categoria da tarefa por palavra-chave da pendência. |

## Longo prazo

| Item | Observação |
|---|---|
| Detecção de padrões entre clínicas | Agrupar reclamações/temas recorrentes via *embeddings* (`pgvector`); desenhado, aguarda decisão de provedor (DeepSeek não oferece endpoint de embeddings). |
| Churn preditivo | Usar o histórico acumulado para prever risco antes de acontecer; depende de massa crítica de snapshots mensais. |
| Triagem por IA dos erros do n8n | Épico #66, depende do dashboard de erros (médio prazo) já estar coletando dados. |

---

## Pendências operacionais

- [x] **Migrar o modelo `deepseek-chat`** — feito em 2026-08-03 (`ai_settings.model` = `deepseek-v4-pro`). Atenção: é um modelo de **raciocínio**, e o `max_tokens` herdado (1600) era orçamento de modelo não-raciocinante — ele gastava o teto pensando e devolvia resposta vazia em parte das clínicas. Corrigido para 8000 na migration `0077`; ver o comentário dela antes de baixar esse valor.
- [ ] As **subtarefas por IA** (`src/lib/tasks/actions.ts`) ainda usam `deepseek-chat` via `LLM_MODEL`, com `max_tokens` fixo em 600 — se um dia apontarem para um modelo de raciocínio, cai no mesmo problema.
- [ ] Definir `CRON_SECRET` na Edge Function `collect-groups` e `COLLECT_GROUPS_CRON_SECRET` na VPS (mesmo valor; ver `deploy/verificar-env.sh`) para a sincronização on-demand.
- [ ] Adicionar `DEEPSEEK_API_KEY` na VPS / `.env.local` para a quebra de subtarefas por IA.
- [ ] Conferir se a `SUPABASE_SERVICE_ROLE_KEY` da VPS está atualizada e planejar rotação da service key.
