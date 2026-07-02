import { describe, expect, it } from "vitest";
import { fmtDuration } from "@/lib/whatsapp/format";

describe("fmtDuration", () => {
  it("retorna — para valores ausentes ou inválidos", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(undefined)).toBe("—");
    expect(fmtDuration(-5)).toBe("—");
    expect(fmtDuration(Number.NaN)).toBe("—");
  });

  it("segundos", () => {
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(45)).toBe("45s");
    expect(fmtDuration(59.4)).toBe("59s");
  });

  it("minutos", () => {
    expect(fmtDuration(60)).toBe("1 min");
    expect(fmtDuration(4.5 * 60)).toBe("4 min");
    expect(fmtDuration(59 * 60)).toBe("59 min");
  });

  it("horas", () => {
    expect(fmtDuration(3600)).toBe("1h");
    expect(fmtDuration(3 * 3600 + 20 * 60)).toBe("3h 20min");
    expect(fmtDuration(23 * 3600 + 59 * 60)).toBe("23h 59min");
  });

  it("dias", () => {
    expect(fmtDuration(24 * 3600)).toBe("1d");
    expect(fmtDuration(2 * 24 * 3600 + 5 * 3600)).toBe("2d 5h");
  });
});
