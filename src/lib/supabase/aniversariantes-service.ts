import { createClient } from "@supabase/supabase-js";

// Client de service_role apontando pro schema `public` — onde vive o app
// Aniversariantes (tabelas `aniversariantes_*`), separado do schema `clinic_control`
// que o resto do Clinic Control usa (ver src/lib/supabase/config.ts). Mesmo
// projeto Supabase, dois schemas — mesmo padrão de dois clients usado em
// scripts/import-automacao-clinicas.mts. Server-only, nunca importar no client.
//
// ATENÇÃO: as tabelas `aniversariantes_*` são versionadas pelo OUTRO repositório
// (g4bs2006/Aniversariantes). Este client lê e escreve num schema que este repo
// não cria — um clone daqui não reconstrói o que ele depende. O contrato está em
// docs/reference/schema-aniversariantes.md; mudar coluna de lá quebra aqui sem
// nada acusar. Ver docs/adr/0006-dono-unico-das-migrations.md.
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
