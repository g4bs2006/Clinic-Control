# 0005 — DeepSeek como provedor de LLM

- **Status:** Aceito
- **Data:** modelo migrado em 2026-08-03

## Contexto

Os resumos de grupos de WhatsApp, as sugestões de tarefa e a quebra em subtarefas
consomem LLM em volume diário, sobre texto em português, para uso interno. O
critério dominante é custo por token, não capacidade de fronteira.

## Decisão

DeepSeek como provedor (`LLM_BASE_URL` / `LLM_MODEL` / `DEEPSEEK_API_KEY`), com
o modelo configurável em runtime via `ai_settings.model`. Consumo registrado em
`ai_usage_log`, com card de custo estimado em Configurações.

## Consequências

- **Modelo trocável sem deploy** (`ai_settings.model`) — e essa flexibilidade tem
  uma armadilha, documentada abaixo.

- **A armadilha do `max_tokens`.** Em 2026-08-03 o modelo passou de
  `deepseek-chat` para `deepseek-v4-pro`, que é um modelo **de raciocínio**. O
  `max_tokens` herdado (1600) era orçamento de modelo não-raciocinante: o modelo
  gastava o teto inteiro pensando e devolvia **resposta vazia** em parte das
  clínicas. Corrigido para 8000 na migration `0077`. **Ler o comentário dessa
  migration antes de baixar esse valor.**

  A mesma armadilha continua armada em `src/lib/tasks/actions.ts`: as subtarefas
  por IA usam `LLM_MODEL` com `max_tokens` fixo em **600**. Se um dia apontarem
  para um modelo de raciocínio, o sintoma se repete.

  A lição generalizável: `max_tokens` não é um limite de segurança, é um
  orçamento — e o orçamento depende da *classe* do modelo, não do provedor.

- **Sem endpoint de embeddings.** O DeepSeek não oferece. Isso **bloqueia** a
  detecção de padrões entre clínicas (agrupar reclamações via `pgvector`), que
  está desenhada e aguardando uma chave de embeddings de outro provedor. É o
  custo concreto desta escolha, e o gatilho para revisitá-la.
