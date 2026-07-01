import { createClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "./config";

// Client de service_role — IGNORA RLS. Server-only. Usar apenas em Server Actions
// para acessar tabelas de credenciais (clinic_integrations). Nunca importar no client.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: DB_SCHEMA },
    },
  );
}
