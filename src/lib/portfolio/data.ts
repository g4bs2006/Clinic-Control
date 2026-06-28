"use server";

import { createClient } from "@/lib/supabase/server";
import { listClinics } from "@/lib/clinics/actions";
import { listSnapshotsForMonth, ensureFrozen } from "@/lib/snapshots/actions";
import { getLiveFunnel } from "@/lib/clinics/integration-actions";
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status";
import { monthKey, prevMonth } from "@/lib/snapshots/month";
import { summarize, type PortfolioRow } from "./aggregate";

// ---------------------------------------------------------------------------
// loadStatusRules
// ---------------------------------------------------------------------------

async function loadStatusRules(): Promise<StatusRule[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("status_rules")
      .select("label, rate_min, rate_max, color")
      .order("position");
    return (data ?? []) as StatusRule[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// getPortfolioForMonth
// ---------------------------------------------------------------------------

export async function getPortfolioForMonth(
  month: string,
): Promise<{ rows: PortfolioRow[]; summary: ReturnType<typeof summarize> }> {
  const [clinics, rules] = await Promise.all([listClinics(), loadStatusRules()]);

  // Lazy freeze: fire for all clinics, tolerate individual failures
  await Promise.allSettled(clinics.map((c) => ensureFrozen(c.id, c.mode)));

  const snapshots = await listSnapshotsForMonth(month);
  const snapshotByClinic = new Map(snapshots.map((s) => [s.clinicId, s]));

  const isCurrent = month === monthKey(new Date());

  // For auto clinics in the current month with no snapshot, batch live fetches
  const autoClinicsWithoutSnapshot = isCurrent
    ? clinics.filter((c) => c.mode === "auto" && !snapshotByClinic.has(c.id))
    : [];

  const liveFunnelResults = await Promise.allSettled(
    autoClinicsWithoutSnapshot.map((c) => getLiveFunnel(c.id)),
  );

  const liveFunnelByClinicId = new Map<
    string,
    { ok: true; funnel: { leads: number; scheduled: number; rate: number; revenue: number } } | { ok: false; error: string }
  >();
  autoClinicsWithoutSnapshot.forEach((c, idx) => {
    const result = liveFunnelResults[idx];
    if (result.status === "fulfilled") {
      liveFunnelByClinicId.set(c.id, result.value);
    }
  });

  const rows: PortfolioRow[] = clinics.map((clinic) => {
    const snap = snapshotByClinic.get(clinic.id);

    if (snap) {
      // Snapshot exists for this clinic+month
      const statusResult = resolveStatus({
        rate: snap.rate,
        override: snap.statusOverride ?? undefined,
        rules,
      });
      return {
        clinicId: clinic.id,
        name: clinic.name,
        city: clinic.city ?? null,
        state: clinic.state ?? null,
        region: clinic.region ?? null,
        mode: clinic.mode,
        source: snap.source,
        leads: snap.leads,
        scheduled: snap.scheduled,
        rate: snap.rate,
        status: statusResult?.label ?? null,
        statusColor: statusResult?.color ?? null,
        revenue: snap.revenue ?? 0,
        lat: clinic.lat ?? null,
        lng: clinic.lng ?? null,
      };
    }

    if (isCurrent && clinic.mode === "auto") {
      // Try live funnel
      const live = liveFunnelByClinicId.get(clinic.id);
      if (live?.ok) {
        const f = live.funnel;
        const statusResult = resolveStatus({ rate: f.rate, rules });
        return {
          clinicId: clinic.id,
          name: clinic.name,
          city: clinic.city ?? null,
          state: clinic.state ?? null,
          region: clinic.region ?? null,
          mode: clinic.mode,
          source: "auto",
          leads: f.leads,
          scheduled: f.scheduled,
          rate: f.rate,
          status: statusResult?.label ?? null,
          statusColor: statusResult?.color ?? null,
          revenue: f.revenue,
          lat: clinic.lat ?? null,
          lng: clinic.lng ?? null,
        };
      }
    }

    // No data available
    return {
      clinicId: clinic.id,
      name: clinic.name,
      city: clinic.city ?? null,
      state: clinic.state ?? null,
      region: clinic.region ?? null,
      mode: clinic.mode,
      source: "none",
      leads: 0,
      scheduled: 0,
      rate: 0,
      status: null,
      statusColor: null,
      revenue: 0,
      lat: clinic.lat ?? null,
      lng: clinic.lng ?? null,
    };
  });

  const summary = summarize(rows);
  return { rows, summary };
}

// ---------------------------------------------------------------------------
// getClinicHistory
// ---------------------------------------------------------------------------

export async function getClinicHistory(
  clinicId: string,
  months: number,
): Promise<{ month: string; rate: number; leads: number; scheduled: number }[]> {
  const supabase = await createClient();
  const currentKey = monthKey(new Date());

  // Build the list of month keys (oldest → newest)
  const monthKeys: string[] = [];
  let key = currentKey;
  for (let i = 0; i < months; i++) {
    monthKeys.unshift(key);
    key = prevMonth(key);
  }

  // Fetch all snapshots for this clinic in one query
  const { data } = await supabase
    .from("monthly_snapshots")
    .select("year_month, rate, leads, scheduled")
    .eq("clinic_id", clinicId)
    .in("year_month", monthKeys);

  const snapshotByMonth = new Map(
    (data ?? []).map((row) => [
      row.year_month as string,
      {
        rate: row.rate as number,
        leads: row.leads as number,
        scheduled: row.scheduled as number,
      },
    ]),
  );

  return monthKeys.map((m) => {
    const snap = snapshotByMonth.get(m);
    return {
      month: m,
      rate: snap?.rate ?? 0,
      leads: snap?.leads ?? 0,
      scheduled: snap?.scheduled ?? 0,
    };
  });
}
