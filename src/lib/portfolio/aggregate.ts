/**
 * Portfolio row type and aggregation logic — pure functions, no I/O.
 */

export type PortfolioRow = {
  clinicId: string;
  name: string;
  city: string | null;
  state: string | null;
  region: string | null;
  mode: "auto" | "manual";
  source: "auto" | "manual" | "none";
  leads: number;
  scheduled: number;
  rate: number;
  status: string | null;
  statusColor: string | null;
  revenue: number;
  lat: number | null;
  lng: number | null;
  totalContacts?: number | null;
  helenaStatus?: string | null;
  helenaSetupStatus?: string | null;
  channels?: { name: string; type: string; status: string }[] | null;
};

export function summarize(rows: PortfolioRow[]): {
  clinicCount: number;
  avgRate: number;
  totalLeads: number;
  totalScheduled: number;
  statusDistribution: { label: string; color: string; count: number }[];
} {
  const clinicCount = rows.length;

  // avgRate: mean over rows with source !== 'none'
  const activeRows = rows.filter((r) => r.source !== "none");
  const avgRate =
    activeRows.length === 0
      ? 0
      : activeRows.reduce((sum, r) => sum + r.rate, 0) / activeRows.length;

  const totalLeads = rows.reduce((sum, r) => sum + r.leads, 0);
  const totalScheduled = rows.reduce((sum, r) => sum + r.scheduled, 0);

  // statusDistribution: group by status label, skip null
  const statusMap = new Map<string, { label: string; color: string; count: number }>();
  for (const row of rows) {
    if (row.status === null) continue;
    const existing = statusMap.get(row.status);
    if (existing) {
      existing.count += 1;
    } else {
      statusMap.set(row.status, {
        label: row.status,
        color: row.statusColor ?? "#9ca3af",
        count: 1,
      });
    }
  }
  const statusDistribution = Array.from(statusMap.values());

  return { clinicCount, avgRate, totalLeads, totalScheduled, statusDistribution };
}
