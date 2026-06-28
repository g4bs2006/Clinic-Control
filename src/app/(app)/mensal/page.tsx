import { createClient } from "@/lib/supabase/server";
import { listClinics } from "@/lib/clinics/actions";
import { listSnapshotsForMonth, ensureFrozen } from "@/lib/snapshots/actions";
import { getLiveFunnel } from "@/lib/clinics/integration-actions";
import { monthKey } from "@/lib/snapshots/month";
import { MonthlyGrid, type GridRow } from "@/components/snapshots/monthly-grid";
import type { StatusRule } from "@/lib/snapshots/status";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string }>;

export default async function MensalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const now = new Date();
  const rawMonth = params.month ?? "";
  const month: string = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : monthKey(now);
  const isCurrentMonth = month === monthKey(now);

  // Load clinics, snapshots, and status rules in parallel
  const [clinics, snapshots, supabase] = await Promise.all([
    listClinics(),
    listSnapshotsForMonth(month),
    createClient(),
  ]);

  // Load status rules
  const { data: rulesData } = await supabase
    .from("status_rules")
    .select("label,rate_min,rate_max,color")
    .order("position");

  const rules: StatusRule[] = (rulesData ?? []) as StatusRule[];

  // Fire ensureFrozen for every clinic (lazy freeze past months on access)
  await Promise.all(clinics.map((c) => ensureFrozen(c.id, c.mode)));

  // For AUTO clinics in the current month, fetch live funnel data
  const liveFunnelMap = new Map<
    string,
    { leads: number; scheduled: number; rate: number; revenue: number | null }
  >();

  if (isCurrentMonth) {
    const autoClinicIds = clinics
      .filter((c) => c.mode === "auto")
      .map((c) => c.id);

    const results = await Promise.allSettled(
      autoClinicIds.map(async (id) => {
        const r = await getLiveFunnel(id);
        return { id, r };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { id, r } = result.value;
        if (r.ok) {
          liveFunnelMap.set(id, {
            leads: r.funnel.leads,
            scheduled: r.funnel.scheduled,
            rate: r.funnel.rate,
            revenue: r.funnel.revenue,
          });
        }
      }
    }
  }

  // Build snapshot lookup map
  const snapshotMap = new Map(snapshots.map((s) => [s.clinicId, s]));

  // Build row models
  const rows: GridRow[] = clinics.map((clinic) => {
    const snap = snapshotMap.get(clinic.id);
    const cityUf = [clinic.city, clinic.state].filter(Boolean).join("/");

    if (clinic.mode === "auto") {
      if (isCurrentMonth) {
        // Show live data (read-only)
        const live = liveFunnelMap.get(clinic.id);
        return {
          clinicId: clinic.id,
          name: clinic.name,
          cityUf,
          mode: "auto",
          source: "auto",
          leads: live?.leads ?? null,
          scheduled: live?.scheduled ?? null,
          rate: live?.rate ?? null,
          statusOverride: snap?.statusOverride ?? null,
          frozen: false,
          editable: false,
        };
      } else {
        // Show frozen snapshot (read-only)
        return {
          clinicId: clinic.id,
          name: clinic.name,
          cityUf,
          mode: "auto",
          source: snap?.source ?? null,
          leads: snap?.leads ?? null,
          scheduled: snap?.scheduled ?? null,
          rate: snap?.rate ?? null,
          statusOverride: snap?.statusOverride ?? null,
          frozen: snap?.frozen ?? false,
          editable: false,
        };
      }
    } else {
      // Manual mode: editable if current month OR snapshot not yet frozen
      const frozen = snap?.frozen ?? false;
      const editable = isCurrentMonth || !frozen;
      return {
        clinicId: clinic.id,
        name: clinic.name,
        cityUf,
        mode: "manual",
        source: snap?.source ?? "manual",
        leads: snap?.leads ?? null,
        scheduled: snap?.scheduled ?? null,
        rate: snap?.rate ?? null,
        statusOverride: snap?.statusOverride ?? null,
        frozen,
        editable,
      };
    }
  });

  // Derive a human-readable month label (pt-BR)
  const [y, m] = month.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold capitalize">{monthLabel}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Grade mensal — {clinics.length} clínica{clinics.length !== 1 ? "s" : ""}
        </p>
      </div>
      <MonthlyGrid month={month} rows={rows} rules={rules} />
    </main>
  );
}
