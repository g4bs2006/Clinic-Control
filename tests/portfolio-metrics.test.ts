import { describe, it, expect } from "vitest";
import { derivedMetrics } from "@/lib/portfolio/metrics";

describe("derivedMetrics", () => {
  it("computes attendance, closing, noShow for a full funnel", () => {
    const counts = {
      "Agendados": 10,
      "Faltosos": 2,
      "Compareceram e Não Fecharam": 3,
      "Compareceram e Fecharam": 4,
    };
    const result = derivedMetrics(counts);
    // attendance = (3 + 4) / 10 = 0.7
    expect(result.attendance).toBeCloseTo(0.7);
    // closing = 4 / (3 + 4) = 4/7 ≈ 0.5714
    expect(result.closing).toBeCloseTo(4 / 7);
    // noShow = 2 / 10 = 0.2
    expect(result.noShow).toBeCloseTo(0.2);
  });

  it("returns 0 when Agendados denominator is 0", () => {
    const counts = {
      "Agendados": 0,
      "Faltosos": 2,
      "Compareceram e Não Fecharam": 3,
      "Compareceram e Fecharam": 4,
    };
    const result = derivedMetrics(counts);
    expect(result.attendance).toBe(0);
    expect(result.noShow).toBe(0);
  });

  it("returns 0 for closing when attendance denominator is 0", () => {
    const counts = {
      "Agendados": 10,
      "Faltosos": 2,
      "Compareceram e Não Fecharam": 0,
      "Compareceram e Fecharam": 0,
    };
    const result = derivedMetrics(counts);
    expect(result.closing).toBe(0);
  });

  it("handles missing keys (treats as 0)", () => {
    const result = derivedMetrics({});
    expect(result.attendance).toBe(0);
    expect(result.closing).toBe(0);
    expect(result.noShow).toBe(0);
  });
});
