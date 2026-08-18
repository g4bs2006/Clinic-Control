# Roadmap — Clinic Control

_Última atualização: 2026-08-18_

> **O acompanhamento do dia a dia vive no [Project](https://github.com/users/g4bs2006/projects)**, não aqui.
> Este arquivo guarda o *porquê* — norte estratégico, frentes e o que foi descartado.
> O *o quê / quando* são as issues. Como o trabalho flui: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Norte estratégico

Transformar o Clinic Control de "painel que a equipe consulta" em **central de operação que puxa a equipe para a ação**, unificando a gestão da carteira de clínicas e substituindo ferramentas dispersas (planilhas, ClickUp, grupos de WhatsApp, CRM).

Três frentes que se reforçam num ciclo:

```
detecta (proatividade) → vira tarefa (matar o ClickUp) → notifica (entrega) → equipe age → rastreia
```

1. **Matar o ClickUp** — completar as tarefas nativas até a equipe não precisar mais dele. _(frente atual)_
2. **Notificações** — levar os sinais para onde a equipe está (WhatsApp / e-mail / push).
3. **Proatividade** — churn preditivo, padrões entre clínicas, ações automáticas.

Descartado por ora: painel para o cliente final — ver [ADR 0003](docs/adr/0003-sem-painel-para-cliente-final.md).

Infra: **VPS Hostinger** (container atrás do nginx da stack `contactia`, auto-deploy do `main` via GitHub Actions) + **Supabase** (banco, storage, Edge Functions e todos os crons). Saímos da Vercel em 2026-07-29 — a decisão e as responsabilidades que ela transferiu para nós estão no [ADR 0002](docs/adr/0002-vps-hostinger-em-vez-de-vercel.md).

---

## Concluído recentemente (julho/2026)

- **Agenda "Minha semana"** — 3º modo em /tarefas com as tarefas do usuário agrupadas por prazo (Atrasadas, Hoje, Esta semana, Mais tarde, Sem prazo).
- **Seleção múltipla + ação em lote** — na lista de tarefas e na fila de sugestões da IA (confirmar/descartar várias de uma vez).
- **Ciclo de vida das tarefas concluídas** — Lista esconde concluídas/canceladas por padrão (toggle "mostrar concluídas"); arquivamento automático das que passam de 7 dias (coluna `archived_at` + cron diário `archive-done-tasks-daily`), preservando o histórico.
- **Board reativo (UI otimista)** — arrastar/mudar status reflete na hora, sem recarregar a página.
- **Melhorias nos resumos de IA** — comparação com o dia anterior (continuidade), severidade que define a prioridade da tarefa, deduplicação de sugestões (`pg_trgm`).
- **Custo de IA** — log de consumo de tokens (`ai_usage_log`) + card de custo estimado em Configurações.
- **Sincronização on-demand de grupos** — botão para coletar grupos novos sem esperar o cron.
- **Endurecimento de segurança** — rate limit de login (`login_attempts`), proteção contra enumeração por timing, senhas temporárias fortes, gates de autenticação nas ações de clínica.

---

## Frente atual: matar o ClickUp

- [x] Agenda "Minha semana" (visão pessoal por prazo)
- [x] Seleção múltipla e ação em lote (lista + sugestões)
- [x] **Tarefas recorrentes** — regras declarativas com materialização lazy, anti-empilhamento e fan-out por carteira; detector de rotinas e diagnóstico pós-onboarding.
- [ ] **Dependências entre tarefas** — "bloqueada por"; envolve migration (`task_dependencies`) + UI + lógica de bloqueio.
- [ ] **Lembretes externos de prazo** — depende da frente de Notificações (a "Minha semana" já cobre o aviso in-app).

---

## Próximos passos (priorizados)

| Prioridade | Item | Observação |
|---|---|---|
| Alta | Dependências entre tarefas | Frente "matar o ClickUp". |
| Alta | Notificações + lembretes de prazo | Fundação de entrega; habilita lembretes externos. Decisão pendente: canal (e-mail é a espinha dorsal mais confiável para alertas críticos, já que a Evolution/WhatsApp pode cair). |
| Média | Detecção de padrões entre clínicas | Agrupar reclamações/temas recorrentes via *embeddings* (`pgvector`); desenhado, aguarda chave de embeddings (DeepSeek não oferece endpoint). |
| Média | Timeline de sentimento (30 dias) | Faixa de sentimento no perfil da clínica. |
| Média | Rollup semanal por IA | Consolidado semanal; aguarda mais dados acumulados. |
| Média | Relatório de conversas — Fase 2/3 | Abas IA×Humano / Habilidades / Mensagens, keywords por clínica e funil na tela. |
| Média | Churn preditivo | Usar o histórico acumulado para prever risco antes de acontecer. |
| Baixa | Categorização automática de pendência | Sugerir categoria da tarefa por palavra-chave da pendência. |
| Baixa | Segurança — itens adiados | Base URL fixa no re-disparo do relatório (`/api/reports/process`); mensagem de erro genérica da Helena ao cliente. |

---

## Pendências operacionais

- [x] **Migrar o modelo `deepseek-chat`** — feito em 2026-08-03 (`ai_settings.model` = `deepseek-v4-pro`). Atenção: é um modelo de **raciocínio**, e o `max_tokens` herdado (1600) era orçamento de modelo não-raciocinante — ele gastava o teto pensando e devolvia resposta vazia em parte das clínicas. Corrigido para 8000 na migration `0077`; ver o comentário dela antes de baixar esse valor.
- [ ] As **subtarefas por IA** (`src/lib/tasks/actions.ts`) ainda usam `deepseek-chat` via `LLM_MODEL`, com `max_tokens` fixo em 600 — se um dia apontarem para um modelo de raciocínio, cai no mesmo problema.
- [ ] Definir `CRON_SECRET` na Edge Function `collect-groups` e `COLLECT_GROUPS_CRON_SECRET` na VPS (mesmo valor; ver `deploy/verificar-env.sh`) para a sincronização on-demand.
- [ ] Adicionar `DEEPSEEK_API_KEY` na VPS / `.env.local` para a quebra de subtarefas por IA.
- [ ] Conferir se a `SUPABASE_SERVICE_ROLE_KEY` da VPS está atualizada e planejar rotação da service key.
