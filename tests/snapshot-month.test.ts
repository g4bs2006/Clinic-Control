import { describe, it, expect } from "vitest";
import { monthKey, prevMonth, isPastMonth, monthRangeBrt } from "@/lib/snapshots/month";

describe("month helpers", () => {
  it("monthKey formata YYYY-MM no fuso do Brasil", () => {
    expect(monthKey(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12"); // 31/12 21:00 BRT
    expect(monthKey(new Date("2026-07-01T01:00:00Z"))).toBe("2026-06"); // 30/06 22:00 BRT
    expect(monthKey(new Date("2026-07-01T03:00:00Z"))).toBe("2026-07"); // 01/07 00:00 BRT
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
  it("monthRangeBrt devolve intervalo meio-aberto em 00:00 BRT (03:00 UTC)", () => {
    const r = monthRangeBrt("2026-06");
    expect(r.after).toBe("2026-06-01T03:00:00.000Z");
    expect(r.before).toBe("2026-07-01T03:00:00.000Z");
  });
});
