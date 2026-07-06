"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChurnRow = {
  id: string;
  clinic_id: string;
  clinic_name: string;
  churn_month: string; // YYYY-MM
  reason: string | null;
  notes: string | null;
  lost_revenue: number | null;
  created_at: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  if (!(await getSessionUser())) return null;
  return createClient();
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function listChurns(): Promise<ChurnRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_churns")
    .select("id, clinic_id, churn_month, reason, notes, lost_revenue, created_at, clinics(name)")
    .order("churn_month", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const clinics = row.clinics as { name: string } | { name: string }[] | null;
    const name = Array.isArray(clinics) ? clinics[0]?.name : clinics?.name;
    return {
      id: row.id as string,
      clinic_id: row.clinic_id as string,
      clinic_name: name ?? "—",
      churn_month: row.churn_month as string,
      reason: row.reason as string | null,
      notes: row.notes as string | null,
      lost_revenue: row.lost_revenue as number | null,
      created_at: row.created_at as string,
    };
  });
}

/** Registra o churn e arquiva a clínica (sai da carteira ativa). */
export async function registerChurn(input: {
  clinicId: string;
  churnMonth: string;
  reason: string;
  notes?: string;
  lostRevenue?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  if (!/^\d{4}-\d{2}$/.test(input.churnMonth)) {
    return { ok: false, error: "Mês inválido (use AAAA-MM)" };
  }

  const { error } = await supabase.from("clinic_churns").insert({
    clinic_id: input.clinicId,
    churn_month: input.churnMonth,
    reason: input.reason || null,
    notes: input.notes?.trim() || null,
    lost_revenue: input.lostRevenue ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const { error: archiveError } = await supabase
    .from("clinics")
    .update({ contract_status: "archived" })
    .eq("id", input.clinicId);
  if (archiveError) return { ok: false, error: archiveError.message };

  revalidatePath("/churns");
  revalidatePath("/");
  revalidatePath("/clinicas");
  return { ok: true };
}

/** Remove o registro; opcionalmente reativa a clínica na carteira. */
export async function removeChurn(
  id: string,
  reactivateClinic: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Não autenticado" };

  const { data: churn, error: fetchError } = await supabase
    .from("clinic_churns")
    .select("clinic_id")
    .eq("id", id)
    .single();
  if (fetchError) return { ok: false, error: fetchError.message };

  const { error } = await supabase.from("clinic_churns").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (reactivateClinic && churn) {
    const { error: reactivateError } = await supabase
      .from("clinics")
      .update({ contract_status: "active" })
      .eq("id", churn.clinic_id);
    if (reactivateError) return { ok: false, error: reactivateError.message };
  }

  revalidatePath("/churns");
  revalidatePath("/");
  revalidatePath("/clinicas");
  return { ok: true };
}
