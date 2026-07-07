# Roadmap — Clinic Control

_Última atualização: 2026-07-07_

## Norte estratégico

Transformar o Clinic Control de "painel que a equipe consulta" em **central de operação que puxa a equipe para a ação**, unificando a gestão da carteira de clínicas e substituindo ferramentas dispersas (planilhas, ClickUp, grupos de WhatsApp, CRM).

Três frentes que se reforçam num ciclo:

```
detecta (proatividade) → vira tarefa (matar o ClickUp) → notifica (entrega) → equipe age → rastreia
```

1. **Matar o ClickUp** — completar as tarefas nativas até a equipe não precisar mais dele. _(frente atual)_
2. **Notificações** — levar os sinais para onde a equipe está (WhatsApp / e-mail / push).
3. **Proatividade** — churn preditivo, padrões entre clínicas, ações automáticas.

Descartado por ora: painel para o cliente final (exigiria isolamento real de dados, incompatível com o modelo atual "todo staff é confiável").

Infra: permanece no **Vercel** (auto-deploy do `main`) + **Supabase**. Avaliamos self-host (TurboCloud/VPS) e decidimos não migrar — está funcionando bem.

---

## Concluído recentemente (julho/2026)

- **Agenda "Minha semana"** — 3º modo em /tarefas com as tarefas do usuário agrupadas por prazo (Atrasadas, Hoje, Esta semana, Mais tarde, Sem prazo).
- **Seleção múltipla + ação em lote** — na lista de tarefas e na fila de sugestões da IA (confirmar/descartar várias de uma vez).
- **Board reativo (UI otimista)** — arrastar/mudar status reflete na hora, sem recarregar a página.
- **Melhorias nos resumos de IA** — comparação com o dia anterior (continuidade), severidade que define a prioridade da tarefa, deduplicação de sugestões (`pg_trgm`).
- **Custo de IA** — log de consumo de tokens (`ai_usage_log`) + card de custo estimado em Configurações.
- **Sincronização on-demand de grupos** — botão para coletar grupos novos sem esperar o cron.
- **Endurecimento de segurança** — rate limit de login (`login_attempts`), proteção contra enumeração por timing, senhas temporárias fortes, gates de autenticação nas ações de clínica.

---

## Frente atual: matar o ClickUp

- [x] Agenda "Minha semana" (visão pessoal por prazo)
- [x] Seleção múltipla e ação em lote (lista + sugestões)
- [ ] **Tarefas recorrentes** — recorrência diária/semanal/mensal; decisão de desenho: materializar a próxima ocorrência ao concluir a atual, ou via `pg_cron`. Envolve migration (regra de recorrência).
- [ ] **Dependências entre tarefas** — "bloqueada por"; envolve migration (`task_dependencies`) + UI + lógica de bloqueio.
- [ ] **Lembretes externos de prazo** — depende da frente de Notificações (a "Minha semana" já cobre o aviso in-app).

---

## Próximos passos (priorizados)

| Prioridade | Item | Observação |
|---|---|---|
| Alta | Tarefas recorrentes | Frente "matar o ClickUp". |
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

- [ ] **Migrar o modelo `deepseek-chat` antes de 2026-07-24** (descontinuação anunciada) — senão os resumos e as subtarefas por IA param. _(prazo fixo)_
- [ ] Definir `CRON_SECRET` na Edge Function `collect-groups` e `COLLECT_GROUPS_CRON_SECRET` no Vercel (mesmo valor) para a sincronização on-demand.
- [ ] Adicionar `DEEPSEEK_API_KEY` no Vercel / `.env.local` para a quebra de subtarefas por IA.
- [ ] Conferir se a `SUPABASE_SERVICE_ROLE_KEY` do Vercel está atualizada e planejar rotação da service key.
