# Ativar Conta

## Informações Gerais

**Título:** Ativar

**Descrição:** Endpoint para reativar/ativar uma conta específica no sistema.

## Detalhes Técnicos

**Método HTTP:** `POST`

**URL do Endpoint:** `https://api.helena.run/core/v1/company/{id}/active`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Caminho (Path Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | uuid | Sim | Identificador único da conta a ser ativada |

### Parâmetros do Corpo (Body Params)

Nenhum parâmetro de corpo requerido para este endpoint.

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso na ativação da conta (retorna o objeto da conta ativada) |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
