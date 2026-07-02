Login integrado

# Login integrado

É possível integrar o login entre plataformas, gerando um token via API e direcionando o usuário

Para integrar o login, você precisará de um **token permanente**, que pode ser obtido em Ajustes → Integração → Integração via API.

Com esse token, sua aplicação backend faz uma requisição POST para autenticar um usuário, definindo em qual conta ele será logado e para qual página será redirecionado.

***

## Parâmetros da Requisição

### Identificação do usuário

| Parâmetro     | Descrição                                                                                                                                    |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `phoneNumber` | Número de telefone do usuário. Para números nacionais, não é necessário formatação especial. Para internacionais, inclua o `+` antes do DDI. |
| `email`       | E-mail cadastrado na plataforma.                                                                                                             |
| `redirectUrl` | URL da página que o usuário acessará após autenticado. Ideal para direcionar diretamente a uma conversa específica. *(opcional)*             |

***

## Componente de Conversas

O componente de conversas está disponível na rota `/chat2/sessions/XXXXXX`, onde `XXXXXX` é o ID da conversa. Há duas variações úteis:

* **`/preview`** — Suprime o menu da plataforma, exibindo apenas a conversa.
* **`?interactive=true`** — Pré-habilita a interação na conversa.

Combinando os dois, a URL completa fica:

```
/chat2/sessions/XXXXXX/preview?interactive=true
```

***

## Fazendo a Requisição

> 🚧 **Atenção:** nunca faça essa requisição no front-end. Ela deve ser realizada exclusivamente via **backend** para preservar a segurança dos seus dados.

Passe o token permanente no cabeçalho usando autenticação **Bearer**:

```
Authorization: Bearer pn_000x000x000x000x000x000x000x00
```

**POST** `https://api.flw.chat/auth/v1/login/authenticate`

**Requisição**

```json
{
  "phoneNumber": "5531999999999",
  "email": "email@seudominio.com",
  "redirectUrl": "/chat2/sessions/df98b9fb-2280-45z5-bce1-3fe8aa7047e5/preview"
}
```

**Resposta**

```json
{
  "userId": "48525e80-43a7-4e06-86e0-f6b67b7d6629",
  "tenantId": "d4ed253d-f0c6-435c-8f7f-59a0598885fe",
  "urlRedirect": "https://xyz.flw.chat/auth/external-login?code=3aXTxVyWtU5p6x7PpGmtlL62XRjbmKUFIWxADykpaWQ&userId=58525e80-43z7-4e06-86e0-f6b67b7d6629&tenantId=d4ed253d-y0c6-435c-8f7f-59a0598885fe",
  "expiresIn": "2026-01-01T00:00:00Z"
}
```

Após receber a resposta, utilize o campo `urlRedirect` para redirecionar o usuário, ele iniciará a sessão já autenticado.