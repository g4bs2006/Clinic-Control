"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Types ────────────────────────────────────────────────────────────────────

/** Uma linha da view whatsapp_response_stats (por clínica + mês). */
export type ResponseStatRow = {
  clinic_id: string;
  year_month: string; // YYYY-MM (fuso America/Sao_Paulo)
  episodes: number;
  answered: number;
  unanswered: number;
  avg_seconds: number | null;
  median_seconds: number | null;
};

export type WhatsappGroupRow = {
  group_jid: string;
  name: string | null;
  clinic_id: string | null;
};

export type TeamMemberRow = {
  id: string;
  lid: string | null;
  name: string | null;
  kind: "human" | "bot";
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return supabase;
}

// ── Métrica de tempo de resposta ─────────────────────────────────────────────

/** Estatísticas de todas as clínicas num mês (para o dashboard). */
export async function listResponseStats(month: string): Promise<ResponseStatRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_response_stats")
    .select("clinic_id, year_month, episodes, answered, unanswered, avg_seconds, median_seconds")
    .eq("year_month", month);
  if (error) throw new Error(error.message);
  return (data ?? []) as ResponseStatRow[];
}

/** Série mensal de uma clínica (mês mais recente primeiro). */
export async function getClinicResponseStats(clinicId: string): Promise<ResponseStatRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_response_stats")
    .select("clinic_id, year_month, episodes, answered, unanswered, avg_seconds, median_seconds")
    .eq("clinic_id", clinicId)
    .order("year_month", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResponseStatRow[];
}

// ── Grupos ───────────────────────────────────────────────────────────────────

export async function listWhatsappGroups(): Promise<WhatsappGroupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("group_jid, name, clinic_id")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as WhatsappGroupRow[];
}

/** Mapeia (ou desmapeia, clinicId=null) um grupo para uma clínica. */
export async function updateGroupClinic(
  groupJid: string,
  clinicId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase
    .from("whatsapp_groups")
    .update({ clinic_id: clinicId, updated_at: new Date().toISOString() })
    .eq("group_jid", groupJid);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  revalidatePath("/");
  return { ok: true };
}

// ── Equipe (identidades @lid) ────────────────────────────────────────────────

export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_team_members")
    .select("id, lid, name, kind")
    .order("kind")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamMemberRow[];
}

export async function addTeamMember(member: {
  lid: string;
  name: string;
  kind: "human" | "bot";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const lid = member.lid.replace(/\D/g, "");
  if (lid.length < 8) return { ok: false, error: "ID (@lid) inválido — só dígitos, mínimo 8" };
  const name = member.name.trim();
  if (name.length < 2) return { ok: false, error: "Nome muito curto" };

  const { error } = await supabase
    .from("whatsapp_team_members")
    .insert({ lid, name, kind: member.kind });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function deleteTeamMember(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.from("whatsapp_team_members").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}
