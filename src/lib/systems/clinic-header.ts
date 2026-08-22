"use server";

// Cabeçalho mínimo da clínica para as telas de configuração de sistema.
//
// Separado de listSystemsMatrix() de propósito: o modal precisa de nome e
// prontuário de UMA clínica, e montar a matriz das 73 para descartar 72 seria
// desperdício num caminho que abre a cada clique de célula.
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionUser } from "@/lib/auth/session";

export type ClinicHeader = { id: string; name: string; system: string | null };

export async function getClinicHeader(clinicId: string): Promise<ClinicHeader | null> {
  if (!(await getSessionUser())) return null;
  const cc = createServiceClient();
  const { data } = await cc
    .from("clinics")
    .select("id, name, system")
    .eq("id", clinicId)
    .maybeSingle();
  return (data as ClinicHeader | null) ?? null;
}
