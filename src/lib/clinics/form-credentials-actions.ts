"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormCredential = {
  id: string;
  clinic_id: string | null;
  form_name: string;
  email: string | null;
  token: string;
  api_user: string | null;
  agenda_link: string | null;
  agenda_code: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FormCredentialInput = {
  form_name: string;
  email?: string;
  token: string;
  api_user?: string;
  agenda_link?: string;
  submitted_at?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrai o código após a última `/` de um link de agenda. */
function deriveAgendaCode(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim().replace(/\/+$/, ""); // remove trailing slashes
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash === -1) return null;
  const code = trimmed.slice(lastSlash + 1);
  return code || null;
}

// ---------------------------------------------------------------------------
// List — credenciais vinculadas a uma clínica
// ---------------------------------------------------------------------------

export async function listFormCredentials(clinicId: string): Promise<FormCredential[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_credentials")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FormCredential[];
}

// ---------------------------------------------------------------------------
// List — credenciais sem vínculo (para mapeamento futuro)
// ---------------------------------------------------------------------------

export async function listUnlinkedCredentials(): Promise<FormCredential[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_credentials")
    .select("*")
    .is("clinic_id", null)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FormCredential[];
}

// ---------------------------------------------------------------------------
// Link / Unlink
// ---------------------------------------------------------------------------

export async function linkCredentialToClinic(credentialId: string, clinicId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("form_credentials")
    .update({ clinic_id: clinicId })
    .eq("id", credentialId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  return { ok: true as const };
}

export async function unlinkCredential(credentialId: string) {
  const supabase = await createClient();
  // Primeiro, obtemos o clinic_id atual para revalidar
  const { data: cred } = await supabase
    .from("form_credentials")
    .select("clinic_id")
    .eq("id", credentialId)
    .single();
  const { error } = await supabase
    .from("form_credentials")
    .update({ clinic_id: null })
    .eq("id", credentialId);
  if (error) return { ok: false as const, error: error.message };
  if (cred?.clinic_id) revalidatePath(`/clinicas/${cred.clinic_id}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Create (manual pela UI)
// ---------------------------------------------------------------------------

export async function createFormCredential(clinicId: string, input: FormCredentialInput) {
  const name = input.form_name?.trim();
  if (!name) return { ok: false as const, error: "Nome é obrigatório" };
  const token = input.token?.trim();
  if (!token) return { ok: false as const, error: "Token é obrigatório" };

  const agendaCode = deriveAgendaCode(input.agenda_link);

  const supabase = await createClient();
  const { error } = await supabase.from("form_credentials").insert({
    clinic_id: clinicId,
    form_name: name,
    email: input.email?.trim() || null,
    token,
    api_user: input.api_user?.trim() || null,
    agenda_link: input.agenda_link?.trim() || null,
    agenda_code: agendaCode,
    submitted_at: input.submitted_at || new Date().toISOString(),
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/clinicas/${clinicId}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateFormCredential(id: string, input: FormCredentialInput) {
  const name = input.form_name?.trim();
  if (!name) return { ok: false as const, error: "Nome é obrigatório" };
  const token = input.token?.trim();
  if (!token) return { ok: false as const, error: "Token é obrigatório" };

  const agendaCode = deriveAgendaCode(input.agenda_link);

  const supabase = await createClient();

  // Get clinic_id for revalidation
  const { data: existing } = await supabase
    .from("form_credentials")
    .select("clinic_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("form_credentials")
    .update({
      form_name: name,
      email: input.email?.trim() || null,
      token,
      api_user: input.api_user?.trim() || null,
      agenda_link: input.agenda_link?.trim() || null,
      agenda_code: agendaCode,
      submitted_at: input.submitted_at || undefined,
    })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  if (existing?.clinic_id) revalidatePath(`/clinicas/${existing.clinic_id}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteFormCredential(id: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("form_credentials")
    .select("clinic_id")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("form_credentials").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  if (existing?.clinic_id) revalidatePath(`/clinicas/${existing.clinic_id}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Upsert (usada pelo webhook — idempotente por token + form_name)
// ---------------------------------------------------------------------------

export async function upsertFormCredential(data: FormCredentialInput & { clinic_id?: string }) {
  const name = data.form_name?.trim();
  if (!name) return { ok: false as const, error: "form_name é obrigatório" };
  const token = data.token?.trim();
  if (!token) return { ok: false as const, error: "token é obrigatório" };

  const agendaCode = deriveAgendaCode(data.agenda_link);

  const supabase = await createClient();

  // Check if there's already a record with this token
  const { data: existing } = await supabase
    .from("form_credentials")
    .select("id")
    .eq("token", token)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from("form_credentials")
      .update({
        form_name: name,
        email: data.email?.trim() || null,
        api_user: data.api_user?.trim() || null,
        agenda_link: data.agenda_link?.trim() || null,
        agenda_code: agendaCode,
        submitted_at: data.submitted_at || null,
      })
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, action: "updated" as const, id: existing.id };
  }

  // Insert new
  const { data: inserted, error } = await supabase
    .from("form_credentials")
    .insert({
      clinic_id: data.clinic_id || null,
      form_name: name,
      email: data.email?.trim() || null,
      token,
      api_user: data.api_user?.trim() || null,
      agenda_link: data.agenda_link?.trim() || null,
      agenda_code: agendaCode,
      submitted_at: data.submitted_at || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, action: "created" as const, id: inserted.id as string };
}
