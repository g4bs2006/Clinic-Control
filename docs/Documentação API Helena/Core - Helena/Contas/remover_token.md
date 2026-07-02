# Remover Token da Conta

## Informações Gerais

**Título:** Remover token

**Descrição:** Endpoint para excluir/revogar um token permanente específico associado a uma conta.

## Detalhes Técnicos

**Método HTTP:** `DELETE`

**URL do Endpoint:** `https://api.helena.run/core/v1/company/{id}/tokens/{tokenId}`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Caminho (Path Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | uuid | Sim | Identificador único da conta |
| `tokenId` | uuid | Sim | Identificador único do token a ser removido |

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Token removido com sucesso |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
