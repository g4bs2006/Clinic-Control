# 0001 — Um projeto Supabase para os dois apps, em schemas separados

- **Status:** Aceito
- **Data da decisão:** anterior a 2026-08-03 (`20260803_aniversariantes_init.sql`)
- **Registrado em:** 2026-08-18

## Contexto

O Aniversariantes nasceu depois do Clinic Control, como painel embutido na
Helena (iframe dentro da plataforma da clínica). Ele precisa dos mesmos dados de
clínica — cadastro, credenciais de prontuário, provedor (e-Clínica ou Clinicorp)
— que o Clinic Control já mantém.

As opções eram: projeto Supabase próprio com sincronização entre os dois, ou o
mesmo projeto.

Complicador: o projeto Supabase `jggfnfxdtfqeqyvxufgu` **já era compartilhado**
com outro sistema da organização, que ocupa o schema `public` — inclusive um
`clinics` que não é o nosso.

## Decisão

Um único projeto Supabase, com **isolamento por schema**:

| Schema | Ocupante | Versionado em |
|---|---|---|
| `clinic_control` | Clinic Control (tabelas próprias) | `Clinic-Control/supabase/migrations/` |
| `public` | outro sistema da organização + Aniversariantes (`aniversariantes_*`) | `Aniversariantes/supabase/migrations/` |

Todos os clients do Clinic Control apontam para `clinic_control` por padrão
(`src/lib/supabase/config.ts` → `DB_SCHEMA`). A exceção é deliberada:
`src/lib/supabase/aniversariantes-service.ts` é um segundo client, de
`service_role`, apontando para `public` para ler as tabelas do Aniversariantes.

Requer que `clinic_control` esteja em *Settings → API → Exposed schemas*.

## Consequências

**Ganho:** zero sincronização — cadastrar uma clínica no Clinic Control já a
disponibiliza no Aniversariantes, e a credencial de prontuário é uma só. E o
schema dedicado eliminou a colisão de nomes com o sistema que já morava em
`public` (dois `clinics` diferentes coexistem sem se ver).

**Custos reais que sobram:**

1. **Dependência de schema não versionada.** O Clinic Control *lê* tabelas
   `aniversariantes_*` cuja criação está no outro repositório. Um `git clone` do
   Clinic Control não contém o schema de que o Clinic Control depende — ver
   [0006](0006-dono-unico-das-migrations.md).
2. **Um client fora do padrão.** `aniversariantes-service.ts` usa `service_role`
   e ignora o `DB_SCHEMA` global. Toda leitura ali passa por cima de qualquer
   política — é um ponto que merece atenção em review.
3. **Blast radius de projeto.** Quota, rotação da service key, pausa do projeto e
   limites de conexão são compartilhados com dois outros sistemas. Um incidente
   de projeto derruba os três; um incidente de *schema*, não.
4. **Sem isolamento por tenant.** O isolamento é entre *sistemas*, não entre
   clínicas. Reforça o [0003](0003-sem-painel-para-cliente-final.md).

O que **não** é um problema, ao contrário do que a leitura apressada sugere: as
duas séries de migrations não competem, porque atuam em schemas disjuntos. A
ordem relativa entre elas é indefinida, mas irrelevante.

## Emenda — 2026-08-21: `public` deixou de ser compartilhado

A #71 foi executada. As tabelas dos outros dois sistemas saíram de `public` e
cada app passou a ter schema próprio:

| Schema | Dono |
|---|---|
| `clinic_control` | Clinic Control |
| `aniversariantes` | repo Aniversariantes |
| `dashboards` | repo DashBoard-s |
| `public` | só `automacao_clinicas` (lida pelo n8n, fora de repo) |

**O que isso muda nesta decisão:**

- A frase acima sobre o schema dedicado ter "eliminado a colisão de nomes com o
  sistema que já morava em `public` (dois `clinics` diferentes coexistem sem se
  ver)" descreve um estado que **não existe mais**. A homônima virou
  `dashboards.clinics`. O schema dedicado do Clinic Control continua correto —
  por isolamento e por ter dono claro — mas não mais por colisão.
- O **custo 3 (blast radius de projeto) continua idêntico.** Quota, rotação da
  service key, pausa do projeto e limites de conexão seguem compartilhados. A #71
  separou *schemas*, não projetos. Era o custo aceito nesta ADR e segue aceito.
- O **custo 1 (dependência não versionada) continua**, e agora é mais visível:
  `aniversariantes-service.ts` aponta para um schema cujo DDL vive noutro repo.
  Ver [0006](0006-dono-unico-das-migrations.md), que segue valendo.
- O **custo 4 (sem isolamento por tenant) continua** e é o que sustenta o
  [0003](0003-sem-painel-para-cliente-final.md). A #71 isolou sistemas, não
  clínicas.

Ou seja: a decisão do 0001 — banco único compartilhado — **não foi revertida**.
O que mudou foi a granularidade do isolamento dentro dele, de "um schema para
nós e `public` para os outros" para "um schema por app". Runbook e procedimento
de rollback em [`../how-to/migracao-schemas-por-app.md`](../how-to/migracao-schemas-por-app.md).
