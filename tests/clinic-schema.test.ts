import { describe, it, expect } from "vitest";
import { clinicInputSchema } from "@/lib/clinics/schema";

describe("clinicInputSchema", () => {
  it("aceita entrada mínima válida", () => {
    const r = clinicInputSchema.safeParse({ name: "OB Clinic" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.mode).toBe("manual"); expect(r.data.contract_status).toBe("active"); }
  });
  it("rejeita nome curto", () => {
    expect(clinicInputSchema.safeParse({ name: "X" }).success).toBe(false);
  });
  it("rejeita UF com tamanho errado", () => {
    expect(clinicInputSchema.safeParse({ name: "Clínica", state: "São Paulo" }).success).toBe(false);
  });
  it("aceita mode auto", () => {
    const r = clinicInputSchema.safeParse({ name: "Clínica", mode: "auto" });
    expect(r.success).toBe(true);
  });
});
