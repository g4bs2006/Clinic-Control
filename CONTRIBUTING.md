# Como o trabalho é organizado

Este arquivo descreve o **processo**. Para o que o sistema faz, ver
[`README.md`](README.md); para por que ele é assim, [`docs/adr/`](docs/adr/).

## A metodologia, em uma frase

**Kanban contínuo, organizado por frentes, com trunk-based development.**

Não usamos Scrum. Sprints de duas semanas pressupõem um lote de escopo fechado
que é revisto na virada — mas aqui o deploy sai no merge e a prioridade muda
quando uma clínica reclama. A cadência já é contínua; sprints só adicionariam
cerimônia sobre ela.

O que sustenta o processo são quatro regras.

### 1. Frentes: uma de cada vez

O [`ROADMAP.md`](ROADMAP.md) define três frentes que se reforçam num ciclo —
*matar o ClickUp*, *notificações*, *proatividade*. **Uma é a frente atual; as
outras hibernam.** Um item de frente hibernada pode ser registrado, mas não
entra em `Doing`.

A frente é um campo no Project, não uma pasta nem um branch.

### 2. Limite de WIP: no máximo 2 em `Doing`

É a única regra de Kanban que muda comportamento de verdade. Se você quer
começar algo e já há dois itens em andamento, a ação correta é **terminar um**,
não abrir o terceiro. Trabalho começado e não entregue tem valor zero e custo de
contexto crescente.

### 3. Trunk-based: branches curtas, `main` sempre verde

```
main ──●────────●──────────●──▶  (cada ● = squash merge = deploy automático)
        \      /
         ●────●  feat/dependencias-tarefas   (horas ou poucos dias)
```

- Branch a partir de `main`, nomeada `feat/…`, `fix/…`, `refactor/…`, `docs/…`.
- **Nunca commitar direto em `main`.** `main` dispara
  `deploy-vps.yml` → produção.
- PR obrigatório. O `ci.yml` roda `tsc --noEmit`, `eslint`, `vitest` e
  `next build`; PR vermelho não entra.
- Squash merge. O título do squash é a mensagem que fica no histórico — então
  ele segue o formato de commit abaixo.
- Branch de vida longa é dívida: quanto mais tempo aberta, mais caro o merge.
  As `fase-*` que ainda existem no remoto são histórico e podem ser apagadas.

### 4. Conventional Commits

```
tipo(escopo): o que mudou, no imperativo e em minúscula
```

Tipos: `feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf`.
Escopo é o domínio, não o arquivo: `tarefas`, `whatsapp`, `ia`, `helena`,
`deploy`, `roadmap`.

O histórico atual já é um bom exemplo — imite o nível de detalhe dele:

```
fix(resumos): max_tokens de modelo não-raciocinante zerava a resposta da IA
fix(collect-groups): checkpoint por grupo evita timeout (504) na coleta
```

Note o padrão: a mensagem diz **a consequência**, não a mudança mecânica.
"altera max_tokens para 8000" é inútil em seis meses; "max_tokens zerava a
resposta da IA" é o que alguém vai procurar.

## O ciclo de um item

```
issue  ──▶  Backlog  ──▶  Próximo  ──▶  Fazendo  ──▶  Em review  ──▶  Concluído
  │                                        │              │
  │                                     branch           PR
  └─ nasce SEMPRE no repo Clinic-Control ──┘         Closes #N
```

1. **Toda issue nasce em `Clinic-Control`**, inclusive as do Aniversariantes e as
   de operação. É o repo-hub de planejamento: uma fila priorizada só existe se
   houver um lugar único onde tudo está. Use a label `app/*` para dizer a qual
   app o item pertence.
2. **O PR nasce no repo do código.** Um item do Aniversariantes tem issue aqui e
   PR lá — o link entre eles é feito à mão no corpo do PR.
3. **`Closes #N`** no corpo do PR. Ao fechar, a automação do Project move o item
   para `Concluído`.

Itens sem código (onboarding de clínica, credencial, configuração de cron) usam
o template **Operação** e são issues normais. Aparecem na mesma fila de
prioridade que features — que é o ponto: competem pelo mesmo tempo.

## Labels

Três eixos, combináveis. Escolha um de cada quando fizer sentido:

| Eixo | Para que serve | Exemplos |
|---|---|---|
| `area/*` | domínio do código, espelha `src/lib/` | `area/tarefas`, `area/ia`, `area/infra` |
| `tipo/*` | natureza do trabalho | `tipo/feat`, `tipo/bug`, `tipo/operacao`, `tipo/divida-tecnica` |
| `app/*` | a qual app pertence | `app/clinic-control`, `app/aniversariantes`, `app/plataforma` |

`bloqueada` é transversal: aguardando outra issue, uma decisão ou um terceiro.
Diga **no comentário** o que destrava — uma label `bloqueada` sem isso é ruído.

**Prioridade, frente e esforço não são labels** — são campos do Project. Label é
para filtrar; campo é para ordenar e agrupar em views.

## Quando escrever um ADR

Se a escolha tem mais de uma opção defensável, é custosa de reverter, ou você
**recusou** algo por um motivo invisível no código → abra uma issue com o
template *Decisão de arquitetura* e, ao fechar, registre em
[`docs/adr/`](docs/adr/). Detalhes de formato no
[README dos ADRs](docs/adr/README.md).

## Cuidados que já custaram caro

Estes não são teoria — cada um tem um commit ou um ADR por trás:

- **O projeto Supabase é compartilhado com dois outros sistemas.** O Clinic
  Control vive no schema `clinic_control`; o Aniversariantes e o outro sistema da
  organização vivem em `public`. Antes de qualquer migration, ler o
  [ADR 0001](docs/adr/0001-banco-unico-compartilhado.md). O schema dedicado
  protege contra colisão de nomes — o que ele **não** protege é a leitura de
  `aniversariantes_*` que o Clinic Control faz em `public`
  ([ADR 0006](docs/adr/0006-dono-unico-das-migrations.md)): mexer nessas tabelas
  do outro repo quebra este app sem que nada aqui acuse.
- **`max_tokens` é orçamento, não limite de segurança**, e o orçamento depende de
  o modelo ser ou não de raciocínio — ver
  [ADR 0005](docs/adr/0005-deepseek-como-provedor-de-llm.md).
- **Variável de ambiente nova precisa de dois lugares:** `.env.example` e a VPS
  (`deploy/verificar-env.sh`). Só no primeiro, quebra em produção.
- **O repositório é público.** Nada de token, credencial, id de paciente ou print
  com dado real — nem em issue, nem em comentário, nem em teste.
