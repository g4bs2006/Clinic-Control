// Tipos e helpers puros compartilhados entre aniversariantes-actions.ts (Server
// Actions) e o componente cliente. Precisam viver FORA do arquivo "use server":
// Next.js exige que toda exportação de um módulo "use server" seja uma função
// async — um helper síncrono como mapClinicSystemToProntuario quebra o build
// (Turbopack: "Server Actions must be async functions").

export type SistemaProntuario = "eclinica" | "clinicorp";

const SYSTEM_TO_PRONTUARIO: Record<string, SistemaProntuario> = {
  Clinicorp: "clinicorp",
  "e-Clínica": "eclinica",
};

/** Só Clinicorp e e-Clínica têm integração no Aniversariantes hoje. */
export function mapClinicSystemToProntuario(system: string | null): SistemaProntuario | null {
  if (!system) return null;
  return SYSTEM_TO_PRONTUARIO[system] ?? null;
}

export type AniversariantesClinica = {
  id: string;
  slug: string;
  nome: string;
  sistema_prontuario: SistemaProntuario;
  helena_from: string | null;
  clinicorp_usuario_api: string | null;
  created_at: string;
};

export type AniversariantesSuggestion = {
  companyId: string | null;
  helenaToken: string | null;
  helenaFrom: string | null;
  clinicorpTokenApi: string | null;
  clinicorpSubscriberId: string | null;
  formCredentialLabel: string | null;
};

export type AniversariantesSetup =
  | { ok: false; error: string }
  | {
      ok: true;
      supported: boolean;
      sistemaProntuario: SistemaProntuario | null;
      clinica: AniversariantesClinica | null;
      suggestion: AniversariantesSuggestion;
    };

export type ProvisionAniversariantesInput = {
  sistemaProntuario: SistemaProntuario;
  helenaToken: string;
  helenaFrom?: string;
  eclinicaToken?: string;
  clinicorpUsuarioApi?: string;
  clinicorpTokenApi?: string;
  clinicorpSubscriberId?: string;
};
