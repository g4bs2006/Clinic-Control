# Clinic Control

Plataforma interna da Contact.IA para gestão da carteira de clínicas odontológicas atendidas por agentes de IA no WhatsApp. Centraliza métricas de funil de conversão, acompanhamento de atendimento (IA e humano), resumos diários gerados por IA, relatórios de conversas, tarefas e o cadastro/configuração de cada clínica.

Aplicação privada de uso interno — não é um produto open source e não aceita contribuições externas.

## Sumário

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Stack tecnológica](#stack-tecnológica)
- [Módulos e funcionalidades](#módulos-e-funcionalidades)
- [Fluxos de dados principais](#fluxos-de-dados-principais)
- [Modelo de dados](#modelo-de-dados)
- [Autenticação e autorização](#autenticação-e-autorização)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Scripts disponíveis](#scripts-disponíveis)
- [Testes](#testes)
- [Deploy](#deploy)
- [Roadmap](#roadmap)

## Visão geral

Cada clínica atendida pela Contact.IA opera em um de dois modos:

- **Automático** — possui uma conta na Helena (plataforma de CRM/chat que hospeda o agente de IA no WhatsApp). O funil de leads, agendamentos e o histórico de conversas são lidos ao vivo da API da Helena.
- **Manual** — não possui integração; os números do funil (leads, agendados) são lançados manualmente todo mês pela equipe.

A plataforma consolida esses dois modos numa única visão de carteira: taxa de conversão por clínica, evolução mês a mês, mapa geográfico, status de saúde da conta, tempo de resposta no WhatsApp, resumos diários por IA e um sistema de tarefas que recebe pendências identificadas automaticamente por esses resumos.

## Arquitetura

```mermaid
flowchart LR
    subgraph Cliente
        Browser[Navegador]
    end

    subgraph Vercel["Vercel — Next.js 16 (App Router)"]
        App["Server Components / Server Actions"]
        API["Rotas de API<br/>(processamento de relatórios)"]
    end

    subgraph Supabase["Supabase"]
        DB[("Postgres<br/>schema clinic_control")]
        Storage[("Storage<br/>arquivos, anexos, relatórios")]
        Edge["Edge Functions<br/>(Deno)"]
        Cron["pg_cron"]
    end

    subgraph Externos["APIs externas"]
        Helena["Helena / WTS Chat<br/>CRM + conversas"]
        Evolution["Evolution API<br/>grupos de WhatsApp"]
        DeepSeek["DeepSeek<br/>LLM compatível OpenAI"]
    end

    Browser -->|HTTPS| App
    App --> API
    App -->|service role| DB
    App -->|URLs assinadas| Storage
    App -->|fetch server-side| Helena
    App -->|fetch server-side| DeepSeek

    Cron -->|dispara| Edge
    Edge -->|grava| DB
    Edge -->|lê/escreve| Evolution
    Edge -->|resume conversas| DeepSeek

    DB -->|trigger| DB
```

Pontos centrais dessa arquitetura:

- **Um único banco Postgres compartilhado** com outro sistema da organização; o Clinic Control vive isolado no schema `clinic_control` (nunca `public`).
- **Todo acesso ao banco a partir do Next.js passa por um client `service_role`** — não há RLS por usuário final porque a autenticação é própria (não usa Supabase Auth) e o controle de acesso é feito na camada de aplicação (server actions).
- **Coleta e resumo do WhatsApp rodam fora do runtime do Next.js**, em Edge Functions agendadas por `pg_cron`, porque são processos longos e periódicos (não cabem no ciclo de uma requisição HTTP).
- **Chamadas a LLM (DeepSeek) acontecem em dois lugares diferentes**: dentro da Edge Function de resumos diários (Deno) e diretamente em uma Server Action do Next.js (quebra de tarefas em subtarefas) — cada uma com sua própria credencial de ambiente.

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Turbopack) |
| Linguagem | TypeScript |
| UI | React 19, Tailwind CSS 4, Base UI (primitivos headless), lucide-react |
| Mobile / PWA | Layout responsivo (navegação em drawer, diálogos em bottom-sheet, tabelas viram cards no mobile) + PWA instalável (manifest + service worker) |
| Gráficos e mapas | Recharts, react-leaflet (tiles CARTO dark) |
| Banco de dados | Supabase Postgres (schema dedicado `clinic_control`) |
| Armazenamento de arquivos | Supabase Storage (buckets privados, acesso via URL assinada) |
| Processos agendados | Supabase Edge Functions (Deno) + `pg_cron` + `pg_net` |
| Autenticação | Própria — tabela `app_users` + cookie de sessão assinado (HMAC-SHA256) |
| Geração de planilhas | ExcelJS |
| Compactação de arquivos | JSZip |
| IA / LLM | DeepSeek (LLM da plataforma — resumos, subtarefas); OpenAI Admin API para monitorar o custo das chaves das clínicas |
| Testes | Vitest + Testing Library |
| Deploy | Vercel (auto-deploy a partir do branch `main`) |

## Módulos e funcionalidades

| Rota | Módulo | Descrição |
|---|---|---|
| `/` | Dashboard | KPIs da carteira, distribuição por faixa de status, ranking de clínicas, alertas de atenção vindos dos resumos de IA, progresso de onboarding, exportação CSV. |
| `/clinicas` | Clínicas | Cadastro, edição e busca. Provisionamento automático de conta na Helena ao criar uma clínica nova. |
| `/clinicas/[id]` | Perfil da clínica | Organizado em abas (Visão geral / Atendimento / IA & Custos / Cadastro): funil de conversão (com mapeamento de colunas configurável por clínica), taxa de agendamento dia a dia, repositório de arquivos, monitor de custo da chave OpenAI da clínica, credenciais de formulário, relatório de conversas, tarefas e checklist da clínica. |
| `/mensal` | Grade mensal | Edição manual de leads/agendados por clínica (clínicas manuais) ou leitura ao vivo (clínicas automáticas). |
| `/comparativo` | Comparativo | Taxa de conversão mês a mês, multi-clínica, gráfico e tabela. |
| `/mapa` | Mapa | Geolocalização das clínicas coloridas por faixa de status. |
| `/whatsapp` | Gerenciador de grupos | Tempo de resposta humano por clínica, resumos diários por IA, saúde da instância Evolution, canais e operadores da Helena. |
| `/tarefas` | Tarefas | Gestão de tarefas da carteira — ver detalhes abaixo. |
| `/acompanhamentos` | Acompanhamentos | Itens de "ficar de olho" (follow-ups passivos: aguardar/monitorar) extraídos pela IA, com ciclo próprio (aberto → resolvido/dispensado) — entidade separada das tarefas de ação. |
| `/churns` | Churns | Registro de desligamento de clínicas, motivos, receita perdida. |
| `/helena` | Contas Helena | Visão consolidada de todas as contas do parceiro na Helena, vinculadas ou não a uma clínica. |
| `/cofre` | Cofre | Senhas e arquivos sensíveis da operação, em duas abas. Senhas/tokens cifrados no banco; arquivos e pastas num bucket privado (upload de arquivo ou pasta, download por URL assinada). Recorte por papel: o gestor gerencia, o desenvolvedor vê só o que foi compartilhado com a equipe. Cada revelação de segredo e download de arquivo é auditado. |
| `/configuracoes` | Configurações | Em 5 abas (Equipe & Conta / IA / Tarefas & Checklist / Funil & Status / WhatsApp): faixas de status, keywords do relatório de conversas, categorias de tarefa, checklist (itens pessoais + fixos globais), usuários e papéis, custo e instruções de IA, grupos/equipe de WhatsApp. O desenvolvedor tem acesso **somente-leitura** aos pontos sensíveis (usuários, categorias de tarefa, faixas de status, WhatsApp) e a aba de IA é exclusiva do gestor. |

### Relatório de conversas

Job assíncrono por clínica e período: coleta as conversas da API da Helena em lotes (com checkpoint, retomável entre execuções), classifica cada mensagem (IA, paciente, humano ou sistema), estima o estágio de funil de vendas (E0 a E8, por palavras-chave configuráveis) e gera uma planilha Excel de três abas (resumo executivo, conversas e funil), disponível para download por link assinado.

### Tarefas

Sistema completo de gestão de pendências da carteira, com escopo por carteira (desenvolvedor vê as tarefas das próprias clínicas; gestor vê todas):

- Criação manual ou automática — os resumos diários de IA identificam pendências, que entram numa fila de sugestões revisável (confirma ou descarta, nunca cria direto). Cada sugestão tem um tipo: **ação** vira tarefa; **acompanhamento** vira um item da entidade `acompanhamentos`. A sugestão não é gerada se já existe um item aberto parecido na mesma clínica (deduplicação por similaridade de texto, `pg_trgm`).
- Categoria, prioridade, responsável, prazo, clínica vinculada (opcional). A prioridade sugerida vem da severidade do resumo que originou a pendência (severidade alta → tarefa urgente).
- **Responsável padrão = dev da clínica.** Ao criar uma tarefa/acompanhamento vinculado a uma clínica, o responsável já vem pré-selecionado com o desenvolvedor dono da carteira daquela clínica (`clinics.developer_id`), editável antes de salvar; sem clínica (ou clínica sem dev), cai em quem está criando.
- Subtarefas reais (não um checklist): a descrição de uma tarefa pode ser enviada ao DeepSeek, que propõe uma quebra em passos menores; a lista é revisada antes de virar tarefas de fato.
- Anexos de arquivo por tarefa.
- Linha do tempo de atividade unificando comentários manuais e o histórico automático de mudança de status.
- **Recorrências** (diária/semanal/mensal) que materializam a próxima ocorrência sob demanda (idempotente, sem empilhar atraso), e **adiar (snooze)** uma tarefa até uma data — ela some da lista e reaparece sozinha no dia.
- Quatro visualizações: **lista**, **board Kanban** (arrastar e soltar entre colunas de status), **agenda "Minha semana"** (só as tarefas atribuídas a você, em aberto, agrupadas por prazo — Atrasadas, Hoje, Esta semana, Mais tarde, Sem prazo) e **Panorama** — o dashboard da carteira: KPIs (atrasadas/hoje/semana/abertas/concluídas), atrasadas em foco, recorrentes com alerta de "rotina furando", carga por responsável e por clínica, distribuição por prioridade/categoria, envelhecimento das abertas, ritmo de criadas × concluídas (14 dias) e **concluídas em foco** (recentes, com contagem de anexos e comentários, abrindo o detalhe completo).

### Checklist de clínicas

Checkboxes que aparecem no perfil de cada clínica e como resumo de progresso na listagem. Dois tipos de item: **pessoais** (cada usuário cria e vê só os seus) e **fixos/globais** (definidos apenas pelo gestor, via um switch "Fixo" no editor de Configurações; aparecem em todas as clínicas, para todos, independentemente de carteira). O estado marcado é **individual por usuário** — inclusive nos itens fixos, cada um acompanha o próprio progresso.

### Cofre

Vault global da operação (`/cofre`), em duas abas:

- **Senhas** — logins, tokens, chaves e acessos. O conteúdo sensível é cifrado no banco (AES-256-GCM); login/URL/notas ficam em texto. Revelar um segredo é auditado como gate duro (se o registro de auditoria falhar, o segredo não é retornado) e o conteúdo revelado se auto-oculta após 30 s.
- **Arquivos** — arquivos e pastas importantes num bucket privado (`vault-files`), com árvore de pastas, upload de arquivo ou de pasta inteira, notas por item e download por URL assinada de curta duração (auditado).

Recorte por papel espelhando o resto do sistema: o gestor gerencia; o desenvolvedor só vê os itens marcados como compartilhados com a equipe (`visible_to_devs`), aplicável por senha, por arquivo ou por pasta (com herança por prefixo de caminho).

### Monitor de custo OpenAI

Cada clínica tem a própria API key OpenAI (o agente de IA da clínica). Uma Edge Function (`collect-openai-usage`, `pg_cron` diário) usa uma **Admin Key** da organização para coletar o consumo por chave e por modelo e estimar o custo — calibrado dia a dia para bater com a fatura real da organização. O gestor vincula cada clínica à sua chave por um select; um botão **"Sincronizar chaves"** atualiza o cache de chaves da organização sob demanda (a Admin Key só enxerga chaves da própria organização). Alertas de gasto acima do limite/anomalia viram acompanhamentos, e um botão "Investigar contatos" ranqueia quem está consumindo tokens (possível loop de IA).

## Fluxos de dados principais

### Funil de agendamento (clínicas automáticas)

```mermaid
flowchart LR
    Cards["Cards do painel CRM<br/>(Helena)"] --> Map["Mapeamento de colunas<br/>da clínica"]
    Map --> Rule{{"Coluna do card<br/>configurada como agendado?"}}
    Rule -->|"colunas de agendado<br/>(inclui fechamento)"| Scheduled[Agendado]
    Rule -->|"demais colunas"| NotScheduled[Não agendado]
    Scheduled --> Rate["Taxa = agendados / leads"]
    NotScheduled --> Rate
```

Cada clínica define **quais colunas (steps) do painel Helena** correspondem a chegada de leads, agendados e fechamento — salvo em `clinic_integrations` (`lead_step_ids`, `scheduled_step_ids`, `closing_step_ids`). Isso resolve painéis com colunas nomeadas fora do padrão. Quando uma clínica não tem mapeamento salvo, cai no **fallback canônico** por título de etapa (as 9 etapas padrão em português). Regras: leads = todos os cards do painel; fechamento é subconjunto de agendado; o faturamento é a soma do valor (`monetaryAmount`) dos cards nas colunas de fechamento.

A taxa é cumulativa: um card avança uma única etapa por vez no Kanban da Helena, então contar exclusivamente quem está parado na primeira coluna de agendamento subestima a conversão real de quem já avançou no funil dentro do mesmo mês. O mapeamento vale do mês corrente em diante — snapshots mensais já congelados não são recalculados.

### Resumos diários por IA → sugestão de tarefa

```mermaid
flowchart LR
    Evolution["Evolution API<br/>(grupos de WhatsApp)"] -->|"collect-groups<br/>(pg_cron, 4x/dia)"| Raw[("whatsapp_group_messages")]
    Raw -->|"summarize-groups<br/>(pg_cron, 18h45 BRT)"| DeepSeek1["DeepSeek"]
    DeepSeek1 --> Summaries[("whatsapp_daily_summaries<br/>highlights.tarefas[]")]
    Summaries -->|trigger de banco| Suggestions[("task_suggestions<br/>kind: ação | acompanhamento")]
    Suggestions -->|revisão humana| Decision{{"Confirma ou descarta"}}
    Decision -->|ação| Tasks[("tasks")]
    Decision -->|acompanhamento| Acomp[("acompanhamentos")]
```

Cada resumo recebe no prompt um digest do dia anterior (para o modelo notar continuidade de problemas) e classifica a severidade do dia (`baixa`/`media`/`alta`), que define a prioridade sugerida da tarefa. As mensagens são lidas por `group_jid` pelo mapeamento atual de `whatsapp_groups`, então revincular um grupo a outra clínica passa a valer imediatamente para o próximo resumo. O consumo de tokens de cada chamada de IA (resumo diário, quebra de subtarefas etc.) é registrado em `ai_usage_log`, alimentando um card de custo estimado em Configurações (preços em `src/lib/ai-usage/pricing.ts`).

### Job de relatório de conversas

```mermaid
flowchart LR
    Start["Solicitação<br/>(clínica + período)"] --> Job[("report_jobs")]
    Job --> Collect["Coleta em lotes<br/>(API Helena, com checkpoint)"]
    Collect --> Staging[("report_raw_sessions")]
    Staging --> Analyze["Classificação de mensagens<br/>+ estágio de funil E0-E8"]
    Analyze --> Xlsx["Planilha (ExcelJS)"]
    Xlsx --> Storage[("Supabase Storage<br/>bucket reports")]
    Storage --> Download["Download por<br/>URL assinada"]
```

## Modelo de dados

Todas as tabelas vivem no schema `clinic_control` de um projeto Supabase compartilhado com outro sistema (o schema `public` não pertence a este projeto). O diagrama abaixo cobre as entidades centrais; o schema completo tem mais de 60 migrations incrementais em `supabase/migrations/`.

```mermaid
erDiagram
    CLINICS ||--o{ MONTHLY_SNAPSHOTS : possui
    CLINICS ||--o| CLINIC_INTEGRATIONS : integra
    CLINICS ||--o{ TASKS : origina
    CLINICS ||--o{ TASK_SUGGESTIONS : origina
    CLINICS ||--o{ WHATSAPP_DAILY_SUMMARIES : resume
    CLINICS ||--o{ REPORT_JOBS : solicita
    APP_USERS ||--o{ TASKS : responsável
    APP_USERS ||--o{ TASK_COMMENTS : autor
    TASKS ||--o{ TASKS : subtarefas
    TASKS ||--o{ TASK_ATTACHMENTS : anexos
    TASKS ||--o{ TASK_COMMENTS : atividade
    WHATSAPP_DAILY_SUMMARIES ||--o{ TASK_SUGGESTIONS : gera
    TASK_SUGGESTIONS |o--o| TASKS : promovida_para

    CLINICS {
        uuid id PK
        text name
        text mode "auto | manual"
        text contract_status
        uuid developer_id FK "carteira"
    }
    APP_USERS {
        uuid id PK
        text email
        text role "gestor | desenvolvedor"
    }
    CLINIC_INTEGRATIONS {
        uuid clinic_id FK
        text helena_token_encrypted
        text panel_id
        uuid_array scheduled_step_ids "mapeamento do funil"
        uuid_array closing_step_ids "faturamento"
    }
    MONTHLY_SNAPSHOTS {
        uuid clinic_id FK
        text year_month
        int leads
        int scheduled
        boolean frozen
    }
    TASKS {
        uuid id PK
        uuid clinic_id FK
        uuid parent_task_id FK
        text status
        text priority
        text category
        uuid assigned_to FK
    }
    TASK_SUGGESTIONS {
        uuid id PK
        uuid clinic_id FK
        uuid summary_id FK
        text status "pending | accepted | dismissed"
    }
    REPORT_JOBS {
        uuid id PK
        uuid clinic_id FK
        text status
        text file_path
    }
```

Domínios de tabelas por área:

| Área | Tabelas principais |
|---|---|
| Carteira e usuários | `clinics`, `app_users`, `user_invites` |
| Integração Helena | `clinic_integrations`, `helena_accounts`, `clinic_provisioning` |
| Funil e status | `monthly_snapshots`, `status_rules`, `funnel_steps` |
| Agentes de IA e arquivos | `clinic_agents`, `agent_stages`, arquivos no Storage |
| WhatsApp | `whatsapp_groups`, `whatsapp_group_messages`, `whatsapp_team_members`, `whatsapp_daily_summaries`, `evolution_health_checks` |
| Relatório de conversas | `report_jobs`, `report_raw_sessions`, `report_keywords` |
| Tarefas e acompanhamentos | `tasks`, `task_suggestions`, `task_attachments`, `task_comments`, `task_recurrences`, `task_categories`, `suggestion_jobs`, `acompanhamentos` |
| Cofre | `credential_vault`, `credential_vault_access_log`, `vault_file_meta`, `vault_file_access_log` + bucket `vault-files` |
| Custo OpenAI (chaves das clínicas) | `openai_projects`, `openai_api_keys`, `openai_key_usage`, `openai_alert_settings`, `openai_usage_alerts` |
| IA e segurança | `ai_usage_log` (consumo de tokens/custo do LLM da plataforma), `login_attempts` (rate limit de login) |
| Checklist | `check_items` (pessoal ou fixo/global, via `is_global`), `clinic_checks` (estado por clínica **e** por usuário) |
| Outros | `clinic_churns`, `form_credentials` |

## Autenticação e autorização

A aplicação não usa o Supabase Auth. A sessão é resolvida por uma tabela própria (`app_users`, com hash bcrypt de senha) e um cookie HTTP-only assinado com HMAC-SHA256 (`src/lib/auth/token.ts`), validado tanto no middleware (assinatura e expiração, sem consulta ao banco) quanto nas Server Actions (usuário existe e está ativo).

O login (`src/lib/auth/actions.ts`) tem rate limit por e-mail (bloqueio após 8 falhas em 15 min, via tabela `login_attempts`), roda `bcrypt.compare` mesmo quando o e-mail não existe (contra um hash descartável) para não vazar por timing quais e-mails são válidos, e as senhas temporárias de reset usam RNG criptográfico com ~40 bits de entropia.

```mermaid
flowchart LR
    Login["POST /login"] -->|"bcrypt.compare"| Users[("app_users")]
    Users -->|ok| Sign["Assina token<br/>v1.userId.exp.sig"]
    Sign --> Cookie["Cookie httpOnly<br/>cc_session"]
    Cookie -->|toda requisição| Middleware["Middleware<br/>(verifica assinatura + expiração)"]
    Middleware -->|Server Action| Session["getSessionUser()<br/>(confirma ativo no banco)"]
```

As Server Actions acessam o banco por um client de service role que **ignora o RLS** — todo usuário autenticado é staff interno de confiança, e a autorização é feita em nível de aplicação. Existem dois papéis:

- **gestor** — acesso irrestrito.
- **desenvolvedor** — por padrão enxerga apenas as clínicas em que consta como responsável (`clinics.developer_id`), além de tarefas atribuídas a ele. Esse recorte ("escopo de carteira") é um **filtro de visão** aplicado nas páginas com dado por clínica (dashboard, mensal, comparativo, churns, gerenciador de grupos e tarefas), não uma fronteira de isolamento entre staff.

Operações administrativas são restritas a gestor via `requireGestor()`: trocar papéis, ativar/desativar usuários, redefinir senha e definir o responsável (carteira) de uma clínica — com proteções contra o gestor rebaixar/desativar a si mesmo — além de configurar categorias de tarefa, faixas de status e o WhatsApp (grupos/equipe). Nas Configurações, o desenvolvedor tem acesso **somente-leitura** a esses pontos sensíveis (e à lista de usuários), com a proibição valendo nas duas camadas: gate no servidor e modo read-only na UI. A aba de IA das Configurações é oculta para o desenvolvedor. O cofre e o vínculo de arquivos/senhas seguem o mesmo modelo de compartilhamento explícito (`visible_to_devs`).

## Estrutura do repositório

```
src/
  app/
    (app)/                  rotas autenticadas (layout com sidebar)
      clinicas/
      mensal/, comparativo/, mapa/
      whatsapp/, tarefas/, churns/, helena/, cofre/, configuracoes/
    api/                    rotas de API (processamento de relatório, credenciais de formulário)
    login/, ativar-conta/   rotas públicas
  components/               componentes de UI, organizados por domínio (tasks/, clinics/, vault/, reports/, ...)
  lib/                      lógica de negócio e Server Actions, por domínio
    auth/                   sessão, senha, token assinado, requireGestor
    clinics/, helena/       cadastro de clínicas e integração com a API da Helena
    snapshots/, portfolio/  motor de funil, faixas de status, agregações
    reports/                job de relatório de conversas
    tasks/                  tarefas, sugestões, categorias, recorrências, panorama
    acompanhamentos/        follow-ups passivos (entidade separada das tarefas)
    whatsapp/               tempo de resposta, resumos
    vault/                  cofre — senhas cifradas e arquivos
    openai-usage/           monitor de custo das chaves OpenAI das clínicas
    storage/                helpers de Storage (arquivos de clínica e do cofre)
    crypto/                 criptografia de tokens (AES-256-GCM)
    supabase/               clients Supabase (browser, server, service role)
supabase/
  migrations/               histórico incremental do schema (SQL puro, numerado, 60+ arquivos)
  functions/                Edge Functions (Deno): collect-groups, summarize-groups, health-evolution, collect-openai-usage, notify (digest ao grupo interno)
tests/                      testes Vitest, um arquivo por módulo de lógica pura
docs/                       documentação de apoio (API da Helena, planos de fase)
```

## Configuração do ambiente

```bash
npm install
cp .env.example .env.local
```

Variáveis de ambiente necessárias:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave pública (publishable) do Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Chave de service role — todo acesso ao banco a partir do servidor passa por ela. |
| `AUTH_SECRET` | sim | Segredo (mínimo 32 caracteres) para assinar o cookie de sessão. |
| `HELENA_TOKEN_ENC_KEY` | sim | Chave AES-256 (base64) usada para cifrar o token de cada clínica na Helena. |
| `HELENA_MASTER_TOKEN` | apenas provisionamento automático | Token da conta master/parceira da Helena. |
| `FORM_WEBHOOK_SECRET` | apenas rota de credenciais de formulário | Segredo do webhook de credenciais externas. |
| `DEEPSEEK_API_KEY` | apenas quebra de tarefas por IA | Chave da API DeepSeek, usada pela Server Action de subtarefas. |
| `LLM_MODEL` | opcional | Modelo do DeepSeek (padrão `deepseek-chat`). |
| `LLM_BASE_URL` | opcional | Base URL compatível com OpenAI (padrão `https://api.deepseek.com`), para trocar de provedor de LLM sem alterar código. |

O schema `clinic_control` precisa estar marcado como **Exposed schema** nas configurações da API do projeto Supabase (Settings → API), caso contrário o PostgREST não enxerga as tabelas.

```bash
npm run dev
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento (Turbopack). |
| `npm run build` | Build de produção. |
| `npm start` | Serve o build de produção. |
| `npm run lint` | ESLint. |
| `npm test` | Executa a suíte de testes uma vez. |
| `npm run test:watch` | Executa os testes em modo watch. |

## Testes

A suíte (Vitest) cobre principalmente a lógica de negócio pura — funções sem I/O que calculam funil, taxa de agendamento, classificação de conversas, deduplicação e regras de status — mantidas deliberadamente independentes de banco de dados ou rede para serem rápidas e determinísticas. Componentes de UI interativos (diálogos, uploads, drag-and-drop) são validados manualmente contra o ambiente real antes de cada entrega.

```bash
npm test
```

## Deploy

- **Aplicação**: Vercel, com deploy automático a cada push no branch `main`.
- **Banco de dados e Storage**: Supabase, projeto compartilhado com outro sistema da organização — o Clinic Control usa exclusivamente o schema `clinic_control`.
- **Processos agendados**: Edge Functions do Supabase, disparadas por `pg_cron`/`pg_net` (coleta de grupos, resumo diário, checagem de saúde da instância do WhatsApp).

Migrations em `supabase/migrations/` são aplicadas diretamente no projeto Supabase (não há um passo de build que as execute automaticamente) — cada arquivo é numerado sequencialmente e idempotente sempre que possível (`create table if not exists`, `drop policy if exists` antes de recriar).

## Roadmap

### Direção estratégica

O norte é transformar o Clinic Control de "painel que a equipe consulta" em **central de operação que puxa a equipe para a ação**, unificando a gestão e substituindo o ClickUp. Três frentes que se reforçam num ciclo (*detecta → vira tarefa → notifica → age → rastreia*):

1. **Matar o ClickUp** — completar as tarefas nativas (frente atual).
2. **Notificações** — levar os sinais para onde a equipe está (WhatsApp/e-mail/push).
3. **Proatividade** — churn preditivo, padrões entre clínicas, ações automáticas.

### Concluído recentemente (julho/2026)

- **Desvincular conta Helena** — a página de Contas Helena passou a permitir desfazer o vínculo de uma clínica (par simétrico do "Vincular"), devolvendo a conta ao estado não vinculado para revínculo posterior.
- **Refinos de usabilidade em tarefas** — concluir e abrir a tarefa em página direto da linha da lista, seleção em intervalo com Shift na ação em lote, e o "Adiar" virou um popover ancorado no botão (antes um modal centralizado).
- **Panorama de tarefas** — 4ª visão em /tarefas com o dashboard da carteira (KPIs, atrasadas, recorrentes, carga por responsável/clínica, distribuição, envelhecimento, ritmo e concluídas em foco com anexos/comentários).
- **Cofre com arquivos** — além das senhas cifradas, guarda arquivos e pastas num bucket privado (upload de arquivo ou pasta, download auditado), com recorte por papel.
- **Cargos nas Configurações** — o desenvolvedor passou a ter acesso somente-leitura aos pontos sensíveis (usuários, categorias de tarefa, faixas de status, WhatsApp); proibição no servidor e na UI.
- **Sincronização on-demand de chaves OpenAI** — botão que atualiza o cache de chaves da organização sem esperar o cron, para vincular uma clínica nova na hora.
- **Navegação por Ctrl+K** — a paleta global (busca) passou a navegar direto para as páginas principais ("Ir para"), além de clínicas e tarefas.
- **Tarefas recorrentes + adiar (snooze)** — regras diária/semanal/mensal com materialização da próxima ocorrência (anti-empilhamento) e adiamento de tarefa até uma data.
- **Overhaul mobile + PWA** — auditoria completa e correção em tiers: navegação vira drawer (hambúrguer), diálogos viram bottom-sheet, tabelas (clínicas, ranking, grade mensal) viram cards no mobile, alvos de toque maiores nos fluxos de tarefa; app instalável na tela inicial (PWA).
- **Checklist por etapa** — categorias editáveis (Painéis, n8n, Agente de IA, Chatbot…) que agrupam os checkboxes na página da clínica; itens fixos gerenciáveis por qualquer gestor; "Salvar todos".
- **Resumos de IA menos ruidosos** — "regra de fechamento" no prompt (não gera tarefa para o que já foi resolvido na conversa) + temperatura reduzida; busca global (Ctrl+K) passou a respeitar o escopo de carteira.
- **Mapeamento dinâmico do funil** — cada clínica escolhe quais colunas do painel Helena são leads/agendados/fechamento (com fallback canônico), resolvendo painéis fora do padrão.
- **Responsável padrão nas tarefas/acompanhamentos** — pré-seleciona o dev da clínica (editável); o filtro de carteira passou a recortar pelo dono da carteira, não pelo usuário logado.
- **Checklist com itens fixos (globais)** — o gestor marca um item como "Fixo" (aparece em todas as clínicas, para todos); estado marcado passou a ser individual por usuário.
- **Configurações mais enxutas** — painel de keywords do relatório agora é recolhível (fechado por padrão).
- **Digest ao grupo interno** — Edge Function `notify` envia os resumos de pendências/acompanhamentos ao grupo de WhatsApp da equipe (primeiro canal da frente de Notificações).
- **Agenda "Minha semana"** — 3º modo em /tarefas com as tarefas do usuário agrupadas por prazo (primeiro passo de "matar o ClickUp").
- **Melhorias nos resumos de IA** — comparação com o dia anterior (continuidade de problemas), classificação de severidade que define a prioridade sugerida da tarefa, e deduplicação de sugestões contra tarefas já abertas (`pg_trgm`).
- **Custo de IA** — registro de consumo de tokens (`ai_usage_log`) e card de custo estimado em Configurações.
- **Sincronização on-demand de grupos** — botão em Configurações para coletar grupos novos sem esperar o cron.
- **Endurecimento de segurança** — rate limit de login (`login_attempts`), proteção contra enumeração de usuários por timing, senhas temporárias com RNG criptográfico, gates de autenticação nas ações de clínica.
