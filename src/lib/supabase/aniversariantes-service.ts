import { createClient } from "@supabase/supabase-js";

// Client de service_role apontando pro schema `public` — onde vive o app
// Aniversariantes (tabelas `aniversariantes_*`), separado do schema `clinic_control`
// que o resto do Clinic Control usa (ver src/lib/supabase/config.ts). Mesmo
// projeto Supabase, dois schemas — mesmo padrão de dois clients usado em
// scripts/import-automacao-clinicas.mts. Server-only, nunca importar no client.
export function createAniversariantesServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    },
  );
}
