"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";
import { clinicInputSchema, type ClinicInput, type Clinic } from "./schema";
import { regionFromState } from "./region";
import { geocodeAddress } from "@/lib/geocoding/nominatim";
import { CLINIC_SYSTEMS } from "./systems";
import { STRATEGISTS } from "./strategists";
import { TRAFFIC_MANAGERS } from "./traffic-managers";

export async function geoFields(input: ClinicInput) {
  const region = input.state ? regionFromState(input.state) : null;
  let lat: number | null = null, lng: number | null = null;
  if (input.address) {
    const q = [input.address, input.city, input.state].filter(Boolean).join(", ");
    const geo = await geocodeAddress(q);
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }
  return { region, lat, lng };
}

export async function listClinics(): Promise<Clinic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics").select("*")
    .neq("contract_status", "archived")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Clinic[];
}

/**
 * Clínicas dentro do escopo de carteira do usuário — mesmo recorte das páginas
 * com dado por clínica: desenvolvedor vê só as suas; gestor segue o seletor
 * global (cookie), "Todas" devolve tudo. Usado na busca global (Ctrl+K) para não
 * expor/navegar clínicas fora da carteira.
 */
export async function listClinicsInScope(): Promise<Clinic[]> {
  const [all, scope] = await Promise.all([listClinics(), getCarteiraScope()]);
  if (!scope.developerFilter) return all;
  return all.filter((c) => c.developer_id === scope.developerFilter);
}

/**
 * Marca/desfaz a conclusão do onboarding — âncora do diagnóstico pós-onboarding
 * (tarefas dos primeiros 30 dias). Data no fuso operacional (America/Sao_Paulo).
 */
export async function setClinicOnboarded(clinicId: string, onboarded: boolean) {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();
  const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const { error } = await supabase
    .from("clinics")
    .update({ onboarded_at: onboarded ? today : null })
    .eq("id", clinicId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  return { ok: true as const };
}

export async function getClinic(id: string): Promise<Clinic | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clinics").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return (data as Clinic) ?? null;
}

export async function createClinic(input: ClinicInput) {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
  const parsed = clinicInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();

  // Evita duplicatas (inclusive arquivadas) — retry de provisionamento deve
  // ser feito pelo "Reprocessar" no perfil, não criando a clínica de novo.
  const namePattern = parsed.data.name.replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data: existing } = await supabase
    .from("clinics")
    .select("id, contract_status")
    .ilike("name", namePattern)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const suffix = existing.contract_status === "archived" ? " (arquivada)" : "";
    return {
      ok: false as const,
      error: `Já existe uma clínica chamada "${parsed.data.name}"${suffix}. Para reprovisionar na Helena, use o botão Reprocessar no perfil dela.`,
    };
  }

  const { data, error } = await supabase
    .from("clinics")
    .insert({ ...parsed.data, ...(await geoFields(parsed.data)) })
    .select("id").single();
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const, id: data.id as string };
}

export async function updateClinic(id: string, input: ClinicInput) {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
  const parsed = clinicInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({ ...parsed.data, ...(await geoFields(parsed.data)) })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const };
}

// Atualiza apenas o sistema/prontuário da clínica (sem re-geocodificar).
// `system` vazio limpa o campo. Valida contra a lista conhecida.
export async function updateClinicSystem(id: string, system: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();

  const value = system.trim();
  if (value && !(CLINIC_SYSTEMS as readonly string[]).includes(value)) {
    return { ok: false as const, error: "Sistema inválido" };
  }

  const { error } = await supabase
    .from("clinics")
    .update({ system: value || null })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${id}`);
  revalidatePath("/clinicas");
  return { ok: true as const };
}

// Atualiza apenas o estrategista responsável (externo ao sistema, sem login).
// Valor vazio limpa o campo. Valida contra a lista conhecida.
export async function updateClinicStrategist(id: string, strategist: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();

  const value = strategist.trim();
  if (value && !(STRATEGISTS as readonly string[]).includes(value)) {
    return { ok: false as const, error: "Estrategista inválido" };
  }

  const { error } = await supabase
    .from("clinics")
    .update({ strategist: value || null })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${id}`);
  revalidatePath("/clinicas");
  return { ok: true as const };
}

// Atualiza apenas o plano comercial da clínica no ecossistema.
export async function updateClinicPlan(id: string, plan: "black" | "elite" | null) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();

  const { error } = await supabase
    .from("clinics")
    .update({ plan })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${id}`);
  revalidatePath("/clinicas");
  return { ok: true as const };
}

// Atualiza a assinatura OdontoImpact (tráfego pago) e o gestor de tráfego
// responsável. Desligar a assinatura limpa o gestor. Valida contra a lista
// conhecida.
export async function updateClinicOdontoImpact(
  id: string,
  input: { odontoimpact: boolean; traffic_manager: string },
) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();

  const value = input.traffic_manager.trim();
  if (value && !(TRAFFIC_MANAGERS as readonly string[]).includes(value)) {
    return { ok: false as const, error: "Gestor de tráfego inválido" };
  }

  const { error } = await supabase
    .from("clinics")
    .update({
      odontoimpact: input.odontoimpact,
      traffic_manager: input.odontoimpact ? value || null : null,
    })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${id}`);
  revalidatePath("/clinicas");
  return { ok: true as const };
}

// Atualiza apenas o modo de integração da clínica (sem re-geocodificar).
export async function updateClinicMode(id: string, mode: "auto" | "manual") {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();

  const { error } = await supabase
    .from("clinics")
    .update({ mode })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${id}`);
  revalidatePath("/clinicas");
  return { ok: true as const };
}

export async function archiveClinic(id: string) {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update({ contract_status: "archived" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const };
}
