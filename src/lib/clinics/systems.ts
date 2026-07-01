// Sistemas / prontuários eletrônicos que uma clínica pode utilizar.
// Usado no select do cadastro/perfil da clínica. Mantido em código porque a
// lista muda raramente; para adicionar um sistema novo, inclua aqui.

export const CLINIC_SYSTEMS = [
  "Clinicorp",
  "Google Agenda",
  "Controle Odonto",
  "Simples Dental",
  "e-Clínica",
  "Dental Office",
  "Prontuário Verde",
] as const;

export type ClinicSystem = (typeof CLINIC_SYSTEMS)[number];
