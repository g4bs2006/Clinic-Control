# Contrato de schema: `aniversariantes_*`

Referência das tabelas que o **Clinic Control** consome no schema `aniversariantes`, mas
que são versionadas pelo repositório **[Aniversariantes]**. Existe porque essa
dependência é invisível no versionamento — ver
[ADR 0006](../adr/0006-dono-unico-das-migrations.md).

[Aniversariantes]: https://github.com/g4bs2006/Aniversariantes/tree/main/supabase/migrations

> **Regra:** alterar qualquer coluna listada aqui é *breaking change* para o
> Clinic Control. Remover coluna, apertar constraint ou renomear exige PR nos
> dois repos.

## Quem consome, de que lado

```
Clinic-Control                                  Aniversariantes
──────────────                                  ───────────────
lib/clinics/aniversariantes-actions.ts
  └─ lib/supabase/aniversariantes-service.ts
       (client service_role, schema aniversariantes)
              │  lê + ESCREVE                        versiona o schema
              ▼                                              │
  aniversariantes.aniversariantes_clinicas ◀──────────────────┘
```

Atenção: **não é somente leitura.** `provisionAniversariantes()` faz `upsert`
com `onConflict: "slug"` — o Clinic Control cria e atualiza linhas desta tabela.

## `aniversariantes_clinicas`

| Coluna | Tipo | Clinic Control | Observação |
|---|---|---|---|
| `id` | uuid PK | lê | |
| `slug` | text unique not null | lê + escreve | **É o `company_id` da Helena**, vindo de `clinic_integrations.company_id`. Sem ele não há provisionamento. |
| `nome` | text not null | lê + escreve | |
| `sistema_prontuario` | text not null, check | lê + escreve | `'eclinica'` ou `'clinicorp'`. Mapeado de `clinics.system` por `mapClinicSystemToProntuario()` — que só conhece `Clinicorp` e `e-Clínica`. |
| `eclinica_token` | text **nullable** | escreve | Era `not null`; a constraint foi solta em `20260811_clinicorp_credenciais_check.sql` para permitir clínica só-Clinicorp. |
| `helena_token` | text not null | escreve | Ver "Credenciais em texto plano". |
| `helena_from` | text | lê + escreve | |
| `clinicorp_usuario_api` | text | lê + escreve | |
| `clinicorp_token_api` | text | escreve | |
| `clinicorp_subscriber_id` | text | escreve | |
| `created_at` | timestamptz | lê | |

Colunas que existem na tabela e o Clinic Control **não** toca:
`eclinica_base_url`, `helena_channel_id`, `timezone`, `clinicorp_base_url`.

### A constraint que o TypeScript duplica

```sql
constraint aniversariantes_clinicas_prontuario_credenciais_check check (
  (sistema_prontuario = 'eclinica'  and eclinica_token is not null)
  or
  (sistema_prontuario = 'clinicorp' and clinicorp_usuario_api is not null
                                    and clinicorp_token_api is not null
                                    and clinicorp_subscriber_id is not null)
)
```

`provisionAniversariantes()` valida exatamente isso em TypeScript, antes do
upsert, para devolver mensagem de erro legível em vez de erro de constraint.
**São duas cópias da mesma regra.** Mudar a constraint sem mudar a validação faz
o app rejeitar o que o banco aceitaria, ou vice-versa.

## Tabelas que o Clinic Control não usa

Fazem parte do schema mas nenhum código do Clinic Control as referencia — estão
aqui só para o mapa ficar completo: `aniversariantes_templates`,
`aniversariantes_envios`, `aniversariantes_pacientes_cache`.

Todas com RLS *deny-all*: acesso apenas por service role no backend.

## Credenciais em texto plano

Assimetria de postura entre os dois lados, registrada de propósito:

| | Clinic Control (`clinic_control`) | Aniversariantes (`aniversariantes`) |
|---|---|---|
| Token Helena | `helena_token_encrypted` — AES-256-GCM, `iv:tag:ciphertext` | `helena_token` — **texto plano** |

`provisionAniversariantes()` decifra o token com `decryptToken()` e grava o
resultado em claro. Vale o mesmo para `eclinica_token` e `clinicorp_token_api`.

Não é exposição pública — as tabelas são deny-all e só o service role alcança —
mas é credencial em claro num banco onde o sistema vizinho cifra a mesma
credencial. Rastreado em issue própria.

## Como verificar que o contrato continua válido

Não há verificação automática hoje (é o item opcional do ADR 0006). Manualmente:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'aniversariantes' and table_name = 'aniversariantes_clinicas'
order by ordinal_position;
```
