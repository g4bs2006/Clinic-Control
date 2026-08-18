# Migração do Supabase — Clinic Control

Passo a passo para reconstruir o projeto numa **nova conta Supabase**.
Gerado em 2026-07-01 a partir da conta antiga (`hrwfmrkvpsojgjpeccyi`).

## ⭐ STATUS (2026-07-01) — aplicado no projeto novo `jggfnfxdtfqeqyvxufgu`
O projeto novo é **compartilhado com outro sistema** (schema `public` tem `clinics`
diferente + `automacao_clinicas`). Por isso o Clinic Control foi instalado num
**schema dedicado `clinic_control`** (não toca no `public`).

**JÁ FEITO:**
- Schema `clinic_control` + todas as tabelas/tipos/RLS/grants criados.
- Bucket de Storage `clinic-files` + policies.
- Dados carregados: 29 clinics, 46 monthly_snapshots, 5 status_rules, 9 funnel_steps,
  1 clinic_integrations, 1 whatsapp_team_members.
- App: os 3 clients Supabase usam `db.schema = 'clinic_control'` (`src/lib/supabase/config.ts`).

**FALTA (manual):**
1. **Expor o schema na API:** painel do projeto novo → Settings → API → **Exposed schemas**
   → adicionar `clinic_control`. SEM ISSO o PostgREST (`.from()`) não enxerga as tabelas.
2. **Env vars** (local `.env` + Vercel):
   - `NEXT_PUBLIC_SUPABASE_URL = <pegar no painel do projeto — Settings → API>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY = <pegar no painel do projeto — Settings → API>`
   - `SUPABASE_SERVICE_ROLE_KEY = <pegar no painel do projeto novo>`
   - `ENCRYPTION`/chave AES da Helena: **reusar a mesma** do deploy antigo (senão o token
     em clinic_integrations não descriptografa → re-cadastrar pela UI).
3. **Auth users** (logins da equipe): recriar no painel (Authentication → Users).
4. **Agentes + arquivos:** re-importar as pastas das clínicas pela UI (recria
   clinic_agents=26, agent_stages=307 e os 631 arquivos do Storage).
5. **n8n:** o node Supabase precisa gravar no schema `clinic_control` (não `public`) —
   ajustar o schema no node/credencial ao montar o fluxo.

---
## (Referência) Reconstrução do zero num projeto VAZIO

## Arquivos deste dump
- `schema.sql` — todo o schema (concatenação das migrations 0001→0010).
- `data.sql` — dados **não reproduzíveis** (clínicas, integração, snapshots, faixas de
  status editadas, etapas do funil, número da equipe).

## 1. Criar o projeto novo e aplicar o schema
1. Crie o projeto na nova conta (região **sa-east-1** para manter latência).
2. Aplique o schema. Duas opções:
   - **Recomendado (mantém histórico de migrations):** rode `supabase db push` com as
     migrations do repo, OU aplique 0001→0010 na ordem via MCP/painel.
   - **Rápido:** cole `schema.sql` inteiro no SQL Editor.

## 2. Carregar os dados
Rode `data.sql` no SQL Editor (ou via MCP `execute_sql`). Ele já usa `on conflict do
nothing` e reescreve `funnel_steps`/`status_rules` (que a migration havia semeado).

## 3. O que NÃO está no SQL (precisa ser refeito à mão)

### 3a. Agentes de IA + arquivos do Storage → RE-IMPORTAR pelas pastas
Os 26 agentes, 307 estágios e **631 arquivos** do bucket `clinic-files` são todos
`imported` (nada foi editado no app). Em vez de migrar por SQL, **re-suba a pasta de
cada clínica** pela UI (aba "Arquivos" no detalhe da clínica) — isso recria os arquivos
no Storage E re-parseia agentes/estágios de uma vez. Fonte local: `01_Clinicas/<mês>/<cliente>/`.
> Se algum dia houver agente/estágio com `source='edited'`, esse conteúdo NÃO volta pelo
> re-import e teria que ser exportado à parte (hoje não há nenhum).

### 3b. Usuários do Auth (logins da equipe)
Os logins ficam em `auth.users`, fora do schema `public` — **não** estão no dump.
Recrie os usuários da equipe no painel (Authentication → Users) do projeto novo.

### 3c. Variáveis de ambiente do app (Vercel/deploy)
Atualizar no deploy e apontar para o projeto novo:
- `NEXT_PUBLIC_SUPABASE_URL` e a chave publishable/anon → do projeto novo.
- `SUPABASE_SERVICE_ROLE_KEY` (se usada no servidor) → do projeto novo.
- **`ENCRYPTION`/chave AES do token da Helena**: o `helena_token_encrypted` em
  `clinic_integrations` só descriptografa se a **mesma chave** for usada. Copie a chave
  atual para o deploy novo. Se a chave mudar, apague a integração e re-cadastre o token
  da Helena pela UI (clínica Dr. João Roberto Furtado).

### 3d. n8n
Trocar a credencial "Supabase API" no workflow `docs/reference/n8n/coleta-grupos-18h.json`
para apontar ao Host + Service Role do projeto novo.

## 4. Conferência pós-migração
```sql
select 'clinics' t, count(*) from clinics
union all select 'monthly_snapshots', count(*) from monthly_snapshots
union all select 'status_rules', count(*) from status_rules
union all select 'clinic_integrations', count(*) from clinic_integrations
union all select 'clinic_agents', count(*) from clinic_agents      -- após re-import
union all select 'agent_stages', count(*) from agent_stages;       -- após re-import
```
Esperado (antes do re-import): clinics=29, monthly_snapshots=46, status_rules=5,
clinic_integrations=1. Depois do re-import: clinic_agents=26, agent_stages=307.
