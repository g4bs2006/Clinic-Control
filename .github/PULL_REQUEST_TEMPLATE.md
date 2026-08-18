## O que muda

<!-- Uma frase. O título já diz o "quê" no formato conventional commit; aqui vai o "por quê". -->

Closes #

## Como verifiquei

<!-- O que você rodou/clicou. "CI passou" não conta como verificação de comportamento. -->

- [ ] `npm test`
- [ ] Testado na UI local

## Checklist

- [ ] Migration incluída? Se sim: confirmei que ela atua no schema `clinic_control` (não em `public`, que pertence a outros sistemas) e que o número é o próximo livre.
- [ ] Nova variável de ambiente? Se sim, adicionei em `.env.example` **e** na VPS (`deploy/verificar-env.sh`).
- [ ] Nenhum segredo, token ou dado de paciente no diff. **O repositório é público.**
- [ ] `ROADMAP.md` atualizado, se isso fecha ou muda um item de frente.
