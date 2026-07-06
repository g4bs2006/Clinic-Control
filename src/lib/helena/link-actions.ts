"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionUser } from "@/lib/auth/session";
import { encryptToken } from "@/lib/crypto/token";
import { createCompanyToken } from "@/lib/helena/admin";
import { clinicInputSchema, type ClinicInput } from "@/lib/clinics/schema";
import { geoFields } from "@/lib/clinics/actions";
import { getCurrentProfile } from "@/lib/users/actions";

// Mesmo modelo de auth das demais integration-actions: qualquer usuário
// autenticado é staff interno com acesso total (ver integration-actions.ts) —
// a única regra extra aqui é que só gestor pode atribuir a carteira a outra
// pessoa; por padrão a clínica cai na carteira de quem está vinculando.

/** Clínicas ainda sem token/painel da Helena — candidatas a "vincular a existente". */
export async function listUnintegratedClinics(): Promise<{ id: string; name: string }[]> {
  const supabase = createServiceClient();
  const [{ data: clinics, error: clinicsError }, { data: integrations, error: integError }] =
    await Promise.all([
      supabase.from("clinics").select("id, name").neq("contract_status", "archived").order("name"),
      supabase.from("clinic_integrations").select("clinic_id"),
    ]);
  if (clinicsError) throw new Error(clinicsError.message);
  if (integError) throw new Error(integError.message);
  const integrated = new Set((integrations ?? []).map((i) => i.clinic_id as string));
  return (clinics ?? []).filter((c) => !integrated.has(c.id as string)) as { id: string; name: string }[];
}

async function resolveDeveloperId(
  requestedDeveloperId: string | null,
): Promise<{ ok: true; developerId: string | null } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (!requestedDeveloperId || requestedDeveloperId === profile.id) {
    return { ok: true, developerId: profile.id };
  }
  if (profile.role !== "gestor") {
    return { ok: false, error: "Apenas gestores podem atribuir a clínica a outro desenvolvedor" };
  }
  return { ok: true, developerId: requestedDeveloperId };
}

async function generateAndSaveToken(clinicId: string, companyId: string) {
  const masterToken = process.env.HELENA_MASTER_TOKEN;
  if (!masterToken) return { ok: false as const, error: "HELENA_MASTER_TOKEN não configurado" };

  const token = await createCompanyToken(masterToken, companyId, "Clinic Control");
  const supabase = createServiceClient();
  const { error } = await supabase.from("clinic_integrations").upsert({
    clinic_id: clinicId,
    company_id: companyId,
    helena_token_encrypted: encryptToken(token),
    last_sync_at: new Date().toISOString(),
  });
  if (error) return { ok: false as const, error: error.message };

  await supabase.from("helena_accounts").update({ clinic_id: clinicId }).eq("company_id", companyId);
  return { ok: true as const };
}

/** Cria uma clínica nova a partir dos dados de uma conta Helena e vincula token+carteira. */
export async function createClinicFromHelenaAccount(
  companyId: string,
  input: ClinicInput,
  requestedDeveloperId: string | null,
) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    const parsed = clinicInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

    const devResult = await resolveDeveloperId(requestedDeveloperId);
    if (!devResult.ok) return devResult;

    if (!process.env.HELENA_MASTER_TOKEN) {
      return { ok: false as const, error: "HELENA_MASTER_TOKEN não configurado" };
    }

    const supabase = createServiceClient();
    const namePattern = parsed.data.name.replace(/[\\%_]/g, (m) => `\\${m}`);
    const { data: existing } = await supabase
      .from("clinics")
      .select("id")
      .ilike("name", namePattern)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        ok: false as const,
        error: `Já existe uma clínica chamada "${parsed.data.name}" — use "Vincular a clínica existente".`,
      };
    }

    const { data: clinic, error: insertError } = await supabase
      .from("clinics")
      .insert({
        ...parsed.data,
        ...(await geoFields(parsed.data)),
        developer_id: devResult.developerId,
      })
      .select("id")
      .single();
    if (insertError) return { ok: false as const, error: insertError.message };

    const tokenResult = await generateAndSaveToken(clinic.id as string, companyId);
    if (!tokenResult.ok) return tokenResult;

    revalidatePath("/helena");
    revalidatePath("/clinicas");
    return { ok: true as const, clinicId: clinic.id as string };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao criar clínica" };
  }
}

/** Vincula uma conta Helena a uma clínica já existente (sem integração). */
export async function linkHelenaAccountToClinic(companyId: string, clinicId: string) {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false as const, error: "Não autenticado" };

    if (!process.env.HELENA_MASTER_TOKEN) {
      return { ok: false as const, error: "HELENA_MASTER_TOKEN não configurado" };
    }

    const tokenResult = await generateAndSaveToken(clinicId, companyId);
    if (!tokenResult.ok) return tokenResult;

    revalidatePath("/helena");
    revalidatePath(`/clinicas/${clinicId}`);
    revalidatePath("/clinicas");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao vincular conta" };
  }
}
