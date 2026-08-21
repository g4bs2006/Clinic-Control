// O projeto Supabase é compartilhado com outros sistemas da organização, cada um
// hoje no seu próprio schema: `aniversariantes` e `dashboards` (issue #71).
// O Clinic Control vive em `clinic_control`.
//
// A colisão de nomes que originalmente justificou este schema dedicado — havia
// um `public.clinics` que não era o nosso — **deixou de existir** com a #71: a
// homônima virou `dashboards.clinics`. O schema dedicado continua certo por
// isolamento e por ter um dono claro, não mais por colisão.
//
// Em `public` sobrou só `automacao_clinicas`, de propósito: quem a lê são os
// workflows do n8n, fora de qualquer repo. Ver src/lib/clinics/automation-projection.ts.
// Todos os clients Supabase usam este schema por padrão nas queries PostgREST.
// Requer que `clinic_control` esteja em Settings → API → Exposed schemas no painel.
export const DB_SCHEMA = "clinic_control";
