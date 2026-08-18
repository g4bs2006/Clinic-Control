# Criar Token da Conta

## Informações Gerais

**Título:** Criar novo token

**Descrição:** Endpoint para gerar um novo token permanente de integração para uma conta específica.

## Detalhes Técnicos

**Método HTTP:** `POST`

**URL do Endpoint:** `https://api.helena.run/core/v1/company/{id}/tokens`

## Autenticação

Requerida via Header.

## Parâmetros

### Parâmetros de Caminho (Path Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `id` | uuid | Sim | Identificador único da conta (ID da conta) |

### Parâmetros do Corpo (Body Params)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `name` | string \| null | Não | Nome identificador do token |

## Respostas

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso na criação do token (retorna as informações do token permanente criado) |
| 500 | Erro no servidor |

## Formato de Resposta

- **Content-Type:** application/json

## Linguagens Suportadas para Exemplos

Shell, Node, Ruby, PHP, Python
