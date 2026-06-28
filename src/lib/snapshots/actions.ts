"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { monthKey, prevMonth } from "@/lib/snapshots/month";
import { resolveStatus } from "@/lib/snapshots/status";
import { getFunnelForMonth } from "@/lib/clinics/integration-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnapshotRow = {
  clinicId: string;
  yearMonth: string;
  leads: number;
  scheduled: number;
  rate: number;
  status: string | null;
  statusOverride: string | null;
  source: "auto" | "manual";
  revenue: number | null;
  frozen: boolean;
};

// ---------------------------------------------------------------------------
// upsertManualSnapshot
// ---------------------------------------------------------------------------

export async function upsertManualSnapshot(
  clinicId: string,
  yearMonth: string,
  leads: number,
  scheduled: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();

    const rate = leads === 0 ? 0 : scheduled / leads;

    // Check for an existing frozen row
    const { data: existing } = await supabase
      .from("monthly_snapshots")
      .select("frozen, status_override")
      .eq("clinic_id", clinicId)
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (existing?.frozen === true) {
      return { ok: false, error: "Mês já fechado" };
    }

    // Build upsert payload — do NOT overwrite existing status_override
    const payload: Record<string, unknown> = {
      clinic_id: clinicId,
      year_month: yearMonth,
      leads,
      scheduled,
      rate,
      source: "manual",
      frozen: false,
    };

    // Preserve existing override; only set to null on new rows (no existing row)
    if (existing === null) {
      payload.status_override = null;
    }
    // If existing row present, omit status_override from payload so it is not touched

    const { error } = await supabase
      .from("monthly_snapshots")
      .upsert(payload, { onConflict: "clinic_id,year_month" });

    if (error) return { ok: false, error: error.message };

    revalidatePath("/mensal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

// ---------------------------------------------------------------------------
// listSnapshotsForMonth
// ---------------------------------------------------------------------------

export async function listSnapshotsForMonth(yearMonth: string): Promise<SnapshotRow[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("monthly_snapshots")
      .select(
        "clinic_id, year_month, leads, scheduled, rate, status, status_override, source, revenue, frozen",
      )
      .eq("year_month", yearMonth);

    if (error || !data) return [];

    return data.map((row) => ({
      clinicId: row.clinic_id as string,
      yearMonth: row.year_month as string,
      leads: row.leads as number,
      scheduled: row.scheduled as number,
      rate: row.rate as number,
      status: (row.status as string | null) ?? null,
      statusOverride: (row.status_override as string | null) ?? null,
      source: row.source as "auto" | "manual",
      revenue: (row.revenue as number | null) ?? null,
      frozen: row.frozen as boolean,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// setStatusOverride
// ---------------------------------------------------------------------------

export async function setStatusOverride(
  clinicId: string,
  yearMonth: string,
  override: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();

    // Verify row exists
    const { data: existing } = await supabase
      .from("monthly_snapshots")
      .select("clinic_id")
      .eq("clinic_id", clinicId)
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (!existing) {
      return { ok: false, error: "Snapshot não encontrado" };
    }

    const { error } = await supabase
      .from("monthly_snapshots")
      .update({ status_override: override })
      .eq("clinic_id", clinicId)
      .eq("year_month", yearMonth);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/mensal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

// ---------------------------------------------------------------------------
// ensureFrozen
// ---------------------------------------------------------------------------

export async function ensureFrozen(
  clinicId: string,
  mode: "auto" | "manual",
): Promise<void> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const currentKey = monthKey(now);

    if (mode === "manual") {
      // Bulk-freeze all past unfrozen rows for this clinic
      await supabase
        .from("monthly_snapshots")
        .update({ frozen: true })
        .eq("clinic_id", clinicId)
        .lt("year_month", currentKey)
        .eq("frozen", false);
      return;
    }

    // mode === "auto": backfill completed months from the CRM, freeze them
    // Load status_rules once
    const { data: rulesData } = await supabase
      .from("status_rules")
      .select("label, rate_min, rate_max, color")
      .order("position");

    const rules = (rulesData ?? []) as {
      label: string;
      rate_min: number;
      rate_max: number;
      color: string;
    }[];

    let ym = prevMonth(currentKey);

    for (let i = 0; i < 12; i++) {
      // Check for existing row
      const { data: existing } = await supabase
        .from("monthly_snapshots")
        .select("frozen")
        .eq("clinic_id", clinicId)
        .eq("year_month", ym)
        .maybeSingle();

      if (existing?.frozen === true) {
        // Hit frozen history boundary — stop
        break;
      }

      if (!existing) {
        // No row yet — fetch from CRM and insert
        const r = await getFunnelForMonth(clinicId, ym);
        if (!r.ok) break; // No integration or no data that far back — stop

        const f = r.funnel;
        const status = resolveStatus({ rate: f.rate, rules })?.label ?? null;

        const { error } = await supabase.from("monthly_snapshots").insert({
          clinic_id: clinicId,
          year_month: ym,
          leads: f.leads,
          scheduled: f.scheduled,
          rate: f.rate,
          revenue: f.revenue,
          step_counts: f.steps,
          source: "auto",
          frozen: true,
          status,
        });

        if (error) {
          // If it's a conflict (another concurrent insert), that's fine — just continue
          if (!error.code?.startsWith("23")) {
            // Non-constraint error — log and continue to next month
            console.error(`[ensureFrozen] insert failed for ${clinicId}/${ym}:`, error.message);
          }
        }
      }
      // If row exists but not frozen, skip (continue to older month)

      ym = prevMonth(ym);
    }
  } catch (e) {
    // Never throw — one clinic failing must not break others
    console.error(`[ensureFrozen] unexpected error for ${clinicId}:`, e);
  }
}
