# 0006 — Tornar rastreável a dependência de schema entre os dois repos

- **Status:** Aceito
- **Data:** 2026-08-18

## Contexto

Consequência do [0001](0001-banco-unico-compartilhado.md). O Clinic Control lê
tabelas que ele não versiona:

```
Clinic-Control/src/lib/supabase/aniversariantes-service.ts
        │  lê  (service_role, schema public)
        ▼
   aniversariantes_*  ──── criadas por ────▶  Aniversariantes/supabase/migrations/
                                                20260803_aniversariantes_init.sql
                                                20260811_clinicorp.sql
                                                20260811_clinicorp_credenciais_check.sql
```

O efeito prático: um `git clone` do Clinic Control, aplicado num Supabase limpo,
produz um app que quebra ao abrir a tela que consome essas tabelas — e nada no
repositório explica por quê. A dependência existe em runtime e é invisível no
versionamento.

**O que este ADR *não* resolve, porque não é problema:** ordem entre as duas
séries de migrations. Elas atuam em schemas disjuntos (`clinic_control` e
`public`), com convenções diferentes (`0077_*` e `20260803_*`), e não competem.
Unificar a numeração seria custo sem ganho.

## Decisão

Tornar a dependência **declarada e verificável**, sem mover migration nenhuma:

1. **Contrato documentado.** [`docs/reference/schema-aniversariantes.md`](../reference/schema-aniversariantes.md)
   descreve as tabelas `aniversariantes_*` que o Clinic Control consome, coluna
   por coluna. Ao escrevê-lo apareceram dois fatos que não estavam registrados
   em lugar nenhum: o acoplamento é de **leitura e escrita** (há `upsert`, não só
   `select`), e a constraint `..._prontuario_credenciais_check` existe **em
   duplicata** — uma vez no banco, outra em TypeScript.
2. **Ponteiro nos dois lados.** Um comentário no topo de
   `aniversariantes-service.ts` aponta para o contrato e para o repo dono;
   o `README.md` do Aniversariantes avisa que essas tabelas têm um consumidor
   externo e que remover coluna é *breaking change*.
3. **`CODEOWNERS`** exige review em `/supabase/migrations/` nos dois repos.
4. **Teste de contrato** (opcional, decidir depois): um teste que consulta o
   `information_schema` e falha se uma coluna do contrato desaparecer. Move a
   descoberta da quebra do runtime em produção para o CI.

## Consequências

- Custo baixo: dois arquivos e um comentário. Nenhuma migration renumerada,
  nenhum risco de reaplicar o que já está no banco.
- A dependência passa a ter um lugar onde é lida antes de ser quebrada. Continua
  sendo convenção, não garantia imposta pelo banco.
- Escrever o contrato já rendeu duas descobertas (upsert e constraint
  duplicada) e uma issue de segurança — credenciais que o Clinic Control cifra
  atravessam para o schema vizinho em texto plano. Documentar acoplamento
  encontra acoplamento.
- **Não é a solução definitiva.** A definitiva é o monorepo com um `packages/db`
  único, onde o contrato deixa de ser documento e volta a ser código verificado
  pelo compilador. Este ADR compra tempo até lá.
