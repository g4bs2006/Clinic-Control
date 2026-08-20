import { createClient } from "@supabase/supabase-js";

// Client de service_role apontando pro schema onde vive o app Aniversariantes
// (tabelas `aniversariantes_*`), separado do schema `clinic_control` que o resto
// do Clinic Control usa (ver src/lib/supabase/config.ts). Mesmo projeto
// Supabase, dois schemas — mesmo padrão de dois clients usado em
// scripts/import-automacao-clinicas.mts. Server-only, nunca importar no client.
//
// ATENÇÃO: as tabelas `aniversariantes_*` são versionadas pelo OUTRO repositório
// (g4bs2006/Aniversariantes). Este client lê e escreve num schema que este repo
// não cria — um clone daqui não reconstrói o que ele depende. O contrato está em
// docs/reference/schema-aniversariantes.md; mudar coluna de lá quebra aqui sem
// nada acusar. Ver docs/adr/0006-dono-unico-das-migrations.md.

// O schema é configurável PARA VIABILIZAR A MIGRAÇÃO, não porque seja opção de
// deploy: as tabelas estão saindo de `public` para um schema `aniversariantes`
// dedicado. A ordem do corte depende disso — este código vai para produção com
// o default `public` (sem mudança de comportamento), as tabelas são movidas, e
// só então a env var é flipada. Sem a env var, o move exigiria deploy de código
// no mesmo instante do ALTER, sem rollback barato.
//
// Quando a migração fechar, isto volta a ser constante — com o valor novo.
const SCHEMA = process.env.ANIVERSARIANTES_DB_SCHEMA ?? "public";

export function createAniversariantesServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: SCHEMA },
    },
  );
}
