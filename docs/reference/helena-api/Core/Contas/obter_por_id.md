# Obter Conta por ID

## Informações Gerais

**Título:** Obter por ID

**Descrição:** Endpoint para obter as informações de uma conta específica através do seu identificador único.

## Detalhes Técnicos

**Método HTTP:** `GET`

**URL do Endpoint:** `https://api.helena.run/core/v1/company/{id}`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Caminho (Path Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | uuid | Sim | Identificador único da conta |

### Parâmetros de Consulta (Query Params)

Nenhum parâmetro de consulta especificado.

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Retorna os dados da conta solicitada |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
