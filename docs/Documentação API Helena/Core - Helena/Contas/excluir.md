# Excluir Conta

## Informações Gerais

**Título:** Excluir

**Descrição:** Endpoint para exclusão de uma conta específica no sistema.

## Detalhes Técnicos

**Método HTTP:** `DELETE`

**URL do Endpoint:** `https://api.helena.run/core/v1/company/{id}`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Caminho (Path Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | uuid | Sim | Identificador único da conta a ser excluída |

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Exclusão da conta realizada com sucesso |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
