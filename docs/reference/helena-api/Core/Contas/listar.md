# Listar Contas

## Informações Gerais

**Título:** Listar

**Descrição:** Para autenticar nos endpoints de Gestão de Contas, utilize o Token de Parceiro. O token pode ser gerado na plataforma em `Admin > Personalizar > Integração`. Envie-o no header `Authorization` com o schema `Bearer`. Este token é exclusivo para os endpoints de Gestão de Contas e Parceiros.
Listagem paginada de contas.

## Detalhes Técnicos

**Método HTTP:** `GET`

**URL do Endpoint:** `https://api.helena.run/core/v1/company`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Consulta (Query Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `SearchableText` | string | Não | Texto para busca |
| `OnlyInactive` | boolean | Não | Filtrar apenas contas inativas |
| `Status` | string (enum) | Não | Status da conta |
| `SetupStatus` | string (enum) | Não | Status de configuração da conta |
| `IncludeDetails` | array of strings (enum) | Não | Detalhes a serem incluídos na resposta |
| `CreatedAt.Before` | string (date-time) | Não | Limite superior de busca, sempre em fuso horário UTM. |
| `CreatedAt.After` | string (date-time) | Não | Limite inferior de busca, sempre em fuso horário UTM. |
| `UpdatedAt.Before` | string (date-time) | Não | Limite superior de busca, sempre em fuso horário UTM. |
| `UpdatedAt.After` | string (date-time) | Não | Limite inferior de busca, sempre em fuso horário UTM. |
| `PageNumber` | integer | Não | Número da página a ser obtida (padrão: 1) |
| `PageSize` | integer | Não | Tamanho da página a ser obtida (padrão: 15) |
| `OrderBy` | string | Não | Nome do campo para ser utilizado como pivô da ordenação. |
| `OrderDirection` | string (enum) | Não | Determina se a ordenação deve ser crescente ou decrescente. |

#### Valores Permitidos para `Status`

| Valor | Descrição |
|-------|-----------|
| `SANDBOX` | Conta de testes (Sandbox) |
| `PRODUCTION` | Conta de produção |

#### Valores Permitidos para `SetupStatus`

| Valor | Descrição |
|-------|-----------|
| `SUBSCRIPTION_PENDING` | Assinatura pendente |
| `SUBSCRIPTION_CREATED` | Assinatura criada |
| `PENDING_CONFIG` | Configuração pendente |
| `COMPLETED` | Configuração concluída |
| `SUBSCRIPTION_ARREARS` | Assinatura em atraso |
| `SUBSCRIPTION_SUSPENDED` | Assinatura suspensa |
| `SUBSCRIPTION_CANCELED` | Assinatura cancelada |

#### Valores Permitidos para `IncludeDetails`

| Valor | Descrição |
|-------|-----------|
| `Config` | Inclui detalhes de configuração da conta |

#### Valores Permitidos para `OrderDirection`

| Valor | Descrição |
|-------|-----------|
| `ASCENDING` | Ordenação ascendente (crescente) |
| `DESCENDING` | Ordenação descendente (decrescente) |

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso na operação |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
