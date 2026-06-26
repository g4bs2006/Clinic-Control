"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clinicInputSchema, type ClinicInput, type Clinic } from "./schema";
import { regionFromState } from "./region";
import { geocodeAddress } from "@/lib/geocoding/nominatim";

async function geoFields(input: ClinicInput) {
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
  const parsed = clinicInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .insert({ ...parsed.data, ...(await geoFields(parsed.data)) })
    .select("id").single();
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const, id: data.id as string };
}

export async function updateClinic(id: string, input: ClinicInput) {
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

export async function archiveClinic(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update({ contract_status: "archived" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clinicas");
  return { ok: true as const };
}
