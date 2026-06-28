import { describe, it, expect } from "vitest";
import { summarize, type PortfolioRow } from "@/lib/portfolio/aggregate";

function makeRow(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    clinicId: "clinic-1",
    name: "Clínica Teste",
    city: "São Paulo",
    state: "SP",
    region: "Sudeste",
    mode: "auto",
    source: "auto",
    leads: 100,
    scheduled: 15,
    rate: 0.15,
    status: "Bom",
    statusColor: "#3b82f6",
    revenue: 5000,
    lat: -23.5,
    lng: -46.6,
    ...overrides,
  };
}

describe("summarize", () => {
  it("counts clinics correctly", () => {
    const rows = [makeRow({ clinicId: "a" }), makeRow({ clinicId: "b" })];
    expect(summarize(rows).clinicCount).toBe(2);
  });

  it("avgRate ignores source:'none' rows", () => {
    const rows = [
      makeRow({ rate: 0.2, source: "auto" }),
      makeRow({ rate: 0.1, source: "manual" }),
      makeRow({ rate: 0.9, source: "none" }), // must be ignored
    ];
    const { avgRate } = summarize(rows);
    // avg of 0.2 and 0.1 = 0.15
    expect(avgRate).toBeCloseTo(0.15);
  });

  it("avgRate is 0 when all rows have source:'none'", () => {
    const rows = [makeRow({ source: "none" })];
    expect(summarize(rows).avgRate).toBe(0);
  });

  it("sums totalLeads and totalScheduled across all rows", () => {
    const rows = [
      makeRow({ leads: 50, scheduled: 5 }),
      makeRow({ leads: 100, scheduled: 10, source: "none" }),
    ];
    const { totalLeads, totalScheduled } = summarize(rows);
    expect(totalLeads).toBe(150);
    expect(totalScheduled).toBe(15);
  });

  it("statusDistribution groups by status label with count and color", () => {
    const rows = [
      makeRow({ status: "Bom", statusColor: "#3b82f6" }),
      makeRow({ status: "Bom", statusColor: "#3b82f6" }),
      makeRow({ status: "Ótimo", statusColor: "#22c55e" }),
      makeRow({ status: null, statusColor: null }), // null status should be skipped
    ];
    const { statusDistribution } = summarize(rows);
    expect(statusDistribution).toHaveLength(2);
    const bom = statusDistribution.find((s) => s.label === "Bom");
    expect(bom).toEqual({ label: "Bom", color: "#3b82f6", count: 2 });
    const otimo = statusDistribution.find((s) => s.label === "Ótimo");
    expect(otimo).toEqual({ label: "Ótimo", color: "#22c55e", count: 1 });
  });

  it("returns empty statusDistribution when all statuses are null", () => {
    const rows = [makeRow({ status: null, statusColor: null })];
    expect(summarize(rows).statusDistribution).toHaveLength(0);
  });

  it("returns zeros and empty distribution for empty rows", () => {
    const result = summarize([]);
    expect(result.clinicCount).toBe(0);
    expect(result.avgRate).toBe(0);
    expect(result.totalLeads).toBe(0);
    expect(result.totalScheduled).toBe(0);
    expect(result.statusDistribution).toHaveLength(0);
  });
});
