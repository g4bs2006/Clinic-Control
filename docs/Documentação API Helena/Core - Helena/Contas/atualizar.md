# Atualizar Conta

## Informações Gerais

**Título:** Atualizar

**Descrição:** Endpoint para atualizar informações de uma conta existente no sistema.

## Detalhes Técnicos

**Método HTTP:** `PUT`

**URL do Endpoint:** `https://api.helena.run/core/v1/company/{id}`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Caminho (Path Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | uuid | Sim | Identificador único da conta a ser atualizada |

### Parâmetros do Corpo (Body Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `documentType` | string (enum) | Não | Tipo de documento (`CPF` ou `CNPJ`) |
| `documentId` | string \| null | Não | Número do documento (CPF ou CNPJ) |
| `legalName` | string \| null | Não | Razão social da empresa |
| `name` | string \| null | Não | Nome fantasia da empresa |
| `category` | string \| null | Não | Categoria da empresa |
| `customCategory` | string \| null | Não | Categoria personalizada da empresa |
| `type` | string (enum) | Não | Tipo da conta |
| `status` | string (enum) | Não | Status da conta |
| `apps` | array of strings (enum) | Não | Apps habilitados na conta |
| `resourcers` | array of strings (enum) | Não | Recursos habilitados na conta |
| `config` | object | Não | Configurações da conta (limites de recursos) |
| `address` | object | Não | Endereço da conta |
| `fields` | array of strings | Sim | Lista de campos que devem ser atualizados na requisição (ex: `["name", "status"]`) |

#### Estrutura do Objeto `config`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session` | integer \| null | Quantidade de sessões incluídas |
| `agents` | integer \| null | Quantidade de agentes incluídos |
| `panels` | integer \| null | Quantidade de painéis incluídos |
| `chatBots` | integer \| null | Quantidade de chatbots incluídos |
| `chatbotAutomations` | integer \| null | Quantidade de automações de chatbot incluídas |
| `whatsAppChannels` | integer \| null | Quantidade de canais de WhatsApp incluídos |
| `instagramChannels` | integer \| null | Quantidade de canais do Instagram incluídos |
| `messengerChannels` | integer \| null | Quantidade de canais do Messenger incluídos |
| `sequences` | integer \| null | Quantidade de sequências incluídas |
| `aiAgents` | integer \| null | Quantidade de agentes de IA incluídos |

#### Estrutura do Objeto `address`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `country` | string \| null | País |
| `state` | string \| null | Estado |
| `city` | string \| null | Cidade |
| `neighborhood` | string \| null | Bairro |
| `zipcode` | string \| null | CEP |
| `number` | string \| null | Número |
| `address1` | string \| null | Logradouro |
| `address2` | string \| null | Complemento |

#### Valores Permitidos para `type`

| Valor | Descrição |
|-------|-----------|
| `UNDEFINED` | Não definido |
| `MEI` | Microempreendedor Individual |
| `LIMITED` | Sociedade Limitada (Ltda.) |
| `INDIVIDUAL` | Empresa Individual |
| `ASSOCIATION` | Associação |

#### Valores Permitidos para `status`

| Valor | Descrição |
|-------|-----------|
| `DEMO` | Modo de demonstração / testes |
| `ONBOARDING` | Fase de onboarding |
| `PRODUCTION` | Em produção |
| `DELAYED` | Faturamento atrasado |
| `SUSPENDED` | Suspensa |
| `CANCELED` | Cancelada |

#### Valores Permitidos para `apps`

`MESSAGE_DELAY`, `SESSION_REASON`, `SESSION_DISTRIBUTION`, `CONTACT_PORTFOLIO`, `PAYMENT`, `WEBHOOK`, `CAMPAIGN`, `PANEL`, `DIALOG`, `SEQUENCE`, `TRANSCRIPTION`, `AI_AGENT`, `SCHEDULED_MESSAGE`, `GROUP`

#### Valores Permitidos para `resourcers`

`WEBHOOK_API`, `CUSTOM_FIELDS`, `INSTA_MESSENGER_CHANNELS`, `UNOFFICIAL_CHANNELS_ENABLED`

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso na atualização da conta (retorna o objeto atualizado) |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
