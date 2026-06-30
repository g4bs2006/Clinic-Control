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

// ---------------------------------------------------------------------------
// getComparison — taxa por clínica por mês (gráfico + tabela do comparativo)
// ---------------------------------------------------------------------------

export type ComparisonCell = {
  rate: number; // fração 0..1
  status: string | null;
  color: string | null;
};

export type ComparisonRow = {
  clinicId: string;
  name: string;
  byMonth: Record<string, ComparisonCell | null>;
};

/**
 * Para cada clínica, devolve a taxa de conversão em cada mês solicitado,
 * já com o status/cor resolvidos. Reaproveita a mesma resolução de dados de
 * `getPortfolioForMonth`: snapshot congelado para meses passados; mês corrente
 * ao vivo (auto sem snapshot) ou snapshot (manual/auto já fechado).
 */
export async function getComparison(months: string[]): Promise<ComparisonRow[]> {
  const [clinics, rules] = await Promise.all([listClinics(), loadStatusRules()]);

  // Lazy freeze dos meses passados; tolera falha por clínica.
  await Promise.allSettled(clinics.map((c) => ensureFrozen(c.id, c.mode)));

  const supabase = await createClient();
  const clinicIds = clinics.map((c) => c.id);

  // Snapshots de todas as clínicas para todos os meses em uma consulta.
  const { data } = clinicIds.length
    ? await supabase
        .from("monthly_snapshots")
        .select("clinic_id, year_month, rate, status_override")
        .in("clinic_id", clinicIds)
        .in("year_month", months)
    : { data: [] as unknown[] };

  // clinicId -> month -> { rate, override }
  const snapByClinicMonth = new Map<string, Map<string, { rate: number; override: string | null }>>();
  for (const raw of (data ?? []) as Array<{
    clinic_id: string;
    year_month: string;
    rate: number;
    status_override: string | null;
  }>) {
    let inner = snapByClinicMonth.get(raw.clinic_id);
    if (!inner) {
      inner = new Map();
      snapByClinicMonth.set(raw.clinic_id, inner);
    }
    inner.set(raw.year_month, { rate: raw.rate, override: raw.status_override });
  }

  const currentMonth = monthKey(new Date());
  const wantsCurrent = months.includes(currentMonth);

  // Auto sem snapshot no mês corrente → leitura ao vivo.
  const autoLiveClinics = wantsCurrent
    ? clinics.filter(
        (c) => c.mode === "auto" && !snapByClinicMonth.get(c.id)?.has(currentMonth),
      )
    : [];

  const liveResults = await Promise.allSettled(
    autoLiveClinics.map((c) => getLiveFunnel(c.id)),
  );
  const liveRateByClinic = new Map<string, number>();
  autoLiveClinics.forEach((c, idx) => {
    const r = liveResults[idx];
    if (r.status === "fulfilled" && r.value.ok) {
      liveRateByClinic.set(c.id, r.value.funnel.rate);
    }
  });

  return clinics.map((clinic) => {
    const inner = snapByClinicMonth.get(clinic.id);
    const byMonth: Record<string, ComparisonCell | null> = {};

    for (const m of months) {
      const snap = inner?.get(m);
      if (snap) {
        const resolved = resolveStatus({
          rate: snap.rate,
          override: snap.override ?? undefined,
          rules,
        });
        byMonth[m] = {
          rate: snap.rate,
          status: resolved?.label ?? null,
          color: resolved?.color ?? null,
        };
        continue;
      }

      if (m === currentMonth && liveRateByClinic.has(clinic.id)) {
        const rate = liveRateByClinic.get(clinic.id)!;
        const resolved = resolveStatus({ rate, rules });
        byMonth[m] = {
          rate,
          status: resolved?.label ?? null,
          color: resolved?.color ?? null,
        };
        continue;
      }

      byMonth[m] = null;
    }

    return { clinicId: clinic.id, name: clinic.name, byMonth };
  });
}
