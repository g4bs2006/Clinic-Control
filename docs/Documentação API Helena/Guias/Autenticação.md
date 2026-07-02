# Autenticação

Entenda como autenticar suas requisições para utilizar a API.

Para uso da API deverá ser gerado um token permanente através da plataforma web.

O token pode ser gerado acessando a página de integrações `Ajustes > Integrações > Integração via API`).

Após gerar o token, informe-o nos `Headers` de cada requisição, utilizando a chave `Authorization` e o schema `Bearer`.

Exemplo: `Authorization: Bearer pn_0000000000000000000000`.

***

Você também pode realizar requisições diretamente a partir desta documentação. Para isso, bastar informar o token no campo adequado, assim como no exemplo abaixo: