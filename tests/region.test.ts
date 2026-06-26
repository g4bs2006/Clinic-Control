import { describe, it, expect } from "vitest";
import { regionFromState } from "@/lib/clinics/region";

describe("regionFromState", () => {
  it("mapeia SP para Sudeste", () => expect(regionFromState("SP")).toBe("Sudeste"));
  it("mapeia BA para Nordeste", () => expect(regionFromState("ba")).toBe("Nordeste"));
  it("mapeia RS para Sul", () => expect(regionFromState("RS")).toBe("Sul"));
  it("mapeia GO para Centro-Oeste", () => expect(regionFromState("GO")).toBe("Centro-Oeste"));
  it("mapeia AM para Norte", () => expect(regionFromState("AM")).toBe("Norte"));
  it("retorna Desconhecida para UF inválida", () => expect(regionFromState("XX")).toBe("Desconhecida"));
});
