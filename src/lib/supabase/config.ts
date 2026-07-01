// O projeto Supabase é compartilhado com outro sistema (que usa o schema `public`).
// O Clinic Control vive num schema dedicado para evitar colisão de nomes (ex.: clinics).
// Todos os clients Supabase usam este schema por padrão nas queries PostgREST.
// Requer que `clinic_control` esteja em Settings → API → Exposed schemas no painel.
export const DB_SCHEMA = "clinic_control";
