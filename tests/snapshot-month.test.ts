import { describe, it, expect } from "vitest";
import { monthKey, prevMonth, isPastMonth, monthRangeUtc } from "@/lib/snapshots/month";

describe("month helpers", () => {
  it("monthKey formata YYYY-MM em UTC", () => {
    expect(monthKey(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
  it("prevMonth atravessa a virada de ano", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-07")).toBe("2026-06");
  });
  it("isPastMonth compara corretamente", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    expect(isPastMonth("2026-05", now)).toBe(true);
    expect(isPastMonth("2026-06", now)).toBe(false);
    expect(isPastMonth("2026-07", now)).toBe(false);
  });
  it("monthRangeUtc devolve intervalo meio-aberto", () => {
    const r = monthRangeUtc("2026-06");
    expect(r.after).toBe("2026-06-01T00:00:00.000Z");
    expect(r.before).toBe("2026-07-01T00:00:00.000Z");
  });
});
