# Sistema de Gestão da Carteira de Clínicas — Design

**Data:** 2026-06-26
**Autor:** Gabriel (Contact.IA) + Claude
**Status:** Aprovado para implementação

---

## 1. Objetivo

Substituir o controle manual em planilhas por um sistema web que centraliza a gestão
da carteira de clínicas odontológicas. O sistema registra o funil de leads de cada
clínica, calcula automaticamente a taxa de conversão e o status de saúde, exibe gráficos
e um mapa geográfico da carteira, e suporta dois modos de alimentação de dados:

- **Automático:** puxa o funil (e o financeiro) direto da API do CRM Helena.
- **Manual:** entrada manual de leads e agendamentos para clínicas que ainda não têm
  o painel de controle de leads na Helena.

## 2. Decisões de arquitetura

| Tema | Decisão |
|---|---|
| Tipo de app | App standalone novo (não integrar à `plataforma_reformada`) |
| Framework | Next.js (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind, **tema escuro como prioridade** |
| Gráficos | Recharts |
| Mapa | MapLibre GL ou react-leaflet (gratuito, sem chave de API) |
| Banco | Supabase (Postgres) |
| Auth | Supabase Auth — apenas usuários internos da Contact |
| Deploy | Vercel |
| Sincronização | **Opção A:** leitura sob demanda do mês corrente + fechamento mensal automático que congela o snapshot |
| Localização do projeto | `C:\Users\T-GAMER\Desktop\Contact\gestao-clinicas` |

### Diagrama

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (App Router) + shadcn/ui + Tailwind + Recharts  │
│  ── deploy na Vercel, login via Supabase Auth ──         │
└───────────────┬─────────────────────────┬───────────────┘
                │                          │
        leitura/escrita            sync sob demanda
                │                          │
        ┌───────▼────────┐        ┌────────▼─────────┐
        │   Supabase     │        │  Helena CRM API  │
        │  (Postgres)    │◄───────┤  token por clínica│
        │                │ job de │  painel "Controle │
        │                │ mensal │   de Leads"       │
        └────────────────┘        └──────────────────┘
```

A camada `lib/helena/` fica isolada para que uma futura migração para sync agendado
(cron) reaproveite a mesma lógica de leitura/parsing.

## 3. Integração com a Helena (API do CRM)

- **Base URL:** `https://api.wts.chat`
- **Auth:** header `Authorization: Bearer <token>` (token permanente por conta/clínica).
- **Listar painéis:** `GET /crm/v1/panel?PageSize=100` → retorna `items[]` com
  `id`, `title`, `key`, `companyId`.
- **Painel + etapas:** `GET /crm/v1/panel/{id}?IncludeDetails=Steps` → retorna
  `steps[]`, cada um com `title`, `position`, `cardCount`, `monetaryAmount`.
- **Cards:** `GET /crm/v1/panel/card?PanelId={id}` com filtros `CreatedAt.After`/
  `CreatedAt.Before` (UTC), `StepId`, paginação. Cada card traz `title`, `description`,
  `stepId`, `tagIds`, `contactIds`, `monetaryAmount`, `createdAt`.

### Funil padrão — painel "Controle de Leads" (9 etapas, validado na conta OB Clinic)

1. Leads (etapa inicial)
2. Agendados
3. Não Agendados
4. Reagendados
5. Cancelados
6. Faltosos
7. Orçamento em Aberto
8. Compareceram e Não Fecharam
9. Compareceram e Fecharam (etapa final)

A contagem por etapa vem de `cardCount`. Para atribuição mensal, contam-se os cards
por `CreatedAt` dentro do mês. O **faturamento** das clínicas automáticas vem do
somatório de `monetaryAmount` dos cards na etapa "Compareceram e Fecharam".

> **Observação a validar na implementação:** confirmar que `monetaryAmount` está
> sendo preenchido nos cards de fechamento das contas reais; nas amostras iniciais
> vinha `null`. Se não vier preenchido, o faturamento automático fica indisponível
> até a clínica passar a registrar o valor no card.

## 4. Métricas por modo (assimétrico)

| Métrica | Automático | Manual |
|---|---|---|
| Leads | ✅ (API) | ✅ (manual) |
| Agendados | ✅ (API) | ✅ (manual) |
| Taxa de conversão (Agendados ÷ Leads) | ✅ | ✅ |
| Funil completo (9 etapas) | ✅ | ❌ |
| Comparecimento, fechamento, no-show | ✅ | ❌ |
| Faturamento / ticket médio | ✅ (via `monetaryAmount`) | ❌ |
| Nível de lead (lista individual) | ✅ | ❌ |

As telas se adaptam ao modo da clínica, exibindo apenas as métricas disponíveis.

## 5. Modelo de dados (Supabase / Postgres)

| Tabela | Propósito | Campos principais |
|---|---|---|
| `clinics` | Cadastro (CRUD completo) | `id`, `name`, `address`, `city`, `state`, `region`, `lat`, `lng`, `mode` (`auto`/`manual`), `contract_status` (`active`/`suspended`/`archived`), `created_at` |
| `clinic_integrations` | Credenciais das automáticas | `clinic_id`, `helena_token` (cifrado), `panel_id`, `company_id`, `last_sync_at` |
| `funnel_steps` | Definição das 9 etapas padrão | `id`, `name`, `position`, `counts_as_scheduling`, `counts_as_closing` |
| `monthly_snapshots` | Histórico mensal congelado | `clinic_id`, `year_month`, `leads`, `scheduled`, `rate`, `status`, `status_override`, `source` (`auto`/`manual`), `revenue`, `step_counts` (jsonb p/ as 9 etapas nas automáticas) |
| `status_rules` | Faixas configuráveis de status | `label`, `rate_min`, `rate_max`, `color` |
| `leads` | Cache do nível de lead (automáticas) | `clinic_id`, `external_card_id`, `name`, `current_step`, `summary`, `created_at` |

Notas:
- `helena_token` cifrado em repouso; nunca trafega para o browser. Todas as chamadas à
  Helena acontecem em Server Actions / Route Handlers.
- Uma clínica pode migrar de `manual` para `auto` sem perder histórico: snapshots antigos
  permanecem com `source = manual`.
- Para automáticas, o mês corrente é lido ao vivo da API; ao virar o mês, um job
  congela o snapshot no banco (origem `auto`).

## 6. Motor de status

- Status calculado a partir da taxa de conversão aplicando as faixas de `status_rules`
  (ex.: `<5%` Risco Churn, `5–9%` Preocupante, `9–13%` Bom, `>13%` Ótimo) — faixas e
  cores **configuráveis** pelo usuário.
- Override manual por clínica/mês para casos especiais (ex.: "Suspenso", "Falta
  entregar" — legendas de cor da planilha atual). O override é registrado e tem
  precedência sobre o cálculo automático.

## 7. CRUD de clínicas e onboarding da integração

Formulário em passos para criar/editar:

1. **Dados básicos:** nome, endereço completo, status do contrato. (Sem mensalidade.)
2. **Modo:** toggle Manual / Automático.
   - **Manual:** salva direto; snapshots serão preenchidos à mão.
   - **Automático:** campo de token Helena → botão "Buscar painéis" → o app chama
     `GET /crm/v1/panel` e exibe um **dropdown com os painéis** (título + key) → usuário
     seleciona → ao salvar, grava token cifrado, `panel_id` e `company_id` derivado, e
     executa um **teste de conexão** ("✓ X leads encontrados").
3. **Editar:** permite trocar modo, token e painel.

Geocodificação do endereço acontece no cadastro (uma vez), persistindo `lat`/`lng`.

## 8. Telas

1. **Dashboard da carteira (home)** — cards-resumo (nº de clínicas, taxa média,
   distribuição por status), tabela-ranking ordenável (espelho da planilha, status
   colorido, mês corrente ao vivo nas automáticas), filtros por mês e região.
2. **Mapa da carteira** — pontos coloridos por status; agregação por região com painel
   "qual região converte melhor" (taxa média por cidade/estado).
3. **Detalhe da clínica** — funil visual das 9 etapas (ao vivo se automática), gráfico
   de tendência mensal da taxa, métricas derivadas (comparecimento, fechamento,
   no-show), faturamento (automáticas), lista de leads (automáticas), formulário de
   snapshot (manuais).
4. **Comparativo** — gráfico multi-clínica e tabela mês-a-mês.
5. **Configurações** — regras de status (faixas) e definição das etapas do funil.

## 9. Direção visual

Tema escuro como prioridade, inspirado nas referências do usuário: dashboard denso em
navy/teal com acentos luminosos, gráficos de linha/área, gauges radiais, donuts, KPIs
grandes em destaque e mapa com pontos coloridos. Recharts + shadcn em dark mode.

## 10. Estratégia de testes

- **Unitários:** motor de cálculo (taxa, status, métricas derivadas do funil) e parser
  das respostas da Helena, usando fixtures reais já capturadas do painel "Controle de
  Leads".
- **Camada Helena:** testada com mocks; teste de fumaça opcional contra a API real.
- **CRUD/Supabase:** testes de integração nas operações de clínica e snapshot.

## 11. Fora de escopo (v1)

- Sync agendado (cron) e webhooks da Helena — evolução futura sobre a mesma camada.
- Login das próprias clínicas (apenas equipe interna por enquanto).
- Investimento em mídia / CAC / CPL e canal de origem dos leads — adicionáveis depois
  sem retrabalho.
