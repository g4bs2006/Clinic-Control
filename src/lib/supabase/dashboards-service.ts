import { createClient } from "@supabase/supabase-js";

// Client de service_role apontando pro schema `dashboards` — onde vive o app
// DashBoard-s (`clinics`, `cards`, `sync_log`, `ingest_log`). Mesmo projeto
// Supabase, schema vizinho; mesmo padrão de aniversariantes-service.ts.
// Server-only, nunca importar no client.
//
// ATENÇÃO: essas tabelas são versionadas pelo OUTRO repositório
// (contactIA/DashBoard-s). Um clone daqui não reconstrói o que ele lê. Mesma
// assimetria do ADR 0006 — e aqui é pior que no Aniversariantes: o DDL de
// `dashboards.clinics` só existe porque foi reconstruído por introspecção em
// `DashBoard-s/supabase/clinics.sql`. O DashBoard-s não tem migrations de
// verdade, então `dashboards` tem dono nominal, não real.
//
// LEITURA APENAS, por enquanto. O Clinic Control lê para montar a coluna
// Dashboard de /sistemas (ADR 0007). A escrita continua no `/setup` do outro
// repo até a #70 portar o wizard — quando isso acontecer, o Clinic Control passa
// a ser o escritor único e o `ADMIN_SECRET` de lá deixa de existir.
//
// Default `dashboards` e não `public`: a migração da #71 foi concluída em
// 2026-08-21 e as tabelas já vivem no schema dedicado. A env var permanece só
// como saída de emergência — ver docs/how-to/migracao-schemas-por-app.md.
const SCHEMA = process.env.DASHBOARDS_DB_SCHEMA ?? "dashboards";

export function createDashboardsServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: SCHEMA },
    },
  );
}
