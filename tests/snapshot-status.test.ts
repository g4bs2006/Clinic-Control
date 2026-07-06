import { describe, it, expect } from "vitest";
import { resolveStatus, findOverlappingRule, type StatusRule } from "@/lib/snapshots/status";

const rules: StatusRule[] = [
  { label: "Risco Churn", rate_min: 0.0, rate_max: 0.05, color: "#9ca3af" },
  { label: "Preocupante", rate_min: 0.05, rate_max: 0.09, color: "#f97316" },
  { label: "Ok/Atenção", rate_min: 0.09, rate_max: 0.11, color: "#eab308" },
  { label: "Bom", rate_min: 0.11, rate_max: 0.13, color: "#3b82f6" },
  { label: "Ótimo", rate_min: 0.13, rate_max: 1.01, color: "#22c55e" },
];

describe("resolveStatus", () => {
  it("classifica pela faixa de taxa", () => {
    expect(resolveStatus({ rate: 0.02, rules })).toEqual({ label: "Risco Churn", color: "#9ca3af" });
    expect(resolveStatus({ rate: 0.12, rules })).toEqual({ label: "Bom", color: "#3b82f6" });
    expect(resolveStatus({ rate: 0.30, rules })).toEqual({ label: "Ótimo", color: "#22c55e" });
  });
  it("limite inferior inclusivo, superior exclusivo", () => {
    expect(resolveStatus({ rate: 0.05, rules })?.label).toBe("Preocupante");
    expect(resolveStatus({ rate: 0.09, rules })?.label).toBe("Ok/Atenção");
  });
  it("override tem precedência e herda a cor da regra de mesmo nome", () => {
    expect(resolveStatus({ rate: 0.30, override: "Risco Churn", rules })).toEqual({ label: "Risco Churn", color: "#9ca3af" });
  });
  it("override sem regra correspondente usa cor neutra", () => {
    expect(resolveStatus({ rate: 0.30, override: "Suspenso", rules })).toEqual({ label: "Suspenso", color: "#9ca3af" });
  });
  it("retorna null quando nenhuma faixa casa e não há override", () => {
    expect(resolveStatus({ rate: 5, rules })).toBeNull();
  });
  it("funciona quando rate_min e rate_max sao strings", () => {
    const stringRules = rules.map(r => ({
      ...r,
      rate_min: String(r.rate_min) as any,
      rate_max: String(r.rate_max) as any,
    }));
    expect(resolveStatus({ rate: 0.02, rules: stringRules })).toEqual({ label: "Risco Churn", color: "#9ca3af" });
    expect(resolveStatus({ rate: 0.12, rules: stringRules })).toEqual({ label: "Bom", color: "#3b82f6" });
  });
});

describe("findOverlappingRule", () => {
  const withIds = rules.map((r, i) => ({ ...r, id: `id-${i}` }));

  it("detecta sobreposição com faixa existente", () => {
    const conflict = findOverlappingRule({ rate_min: 0.2, rate_max: 1.01 }, withIds);
    expect(conflict?.label).toBe("Ótimo");
  });
  it("aceita faixa disjunta", () => {
    expect(findOverlappingRule({ rate_min: 1.01, rate_max: 2 }, withIds)).toBeNull();
  });
  it("limites encostados não contam como sobreposição", () => {
    const partial = withIds.slice(0, 2); // 0–0.05 e 0.05–0.09
    expect(findOverlappingRule({ rate_min: 0.09, rate_max: 0.2 }, partial)).toBeNull();
  });
  it("ignora a própria regra ao editar", () => {
    expect(
      findOverlappingRule({ id: "id-4", rate_min: 0.13, rate_max: 0.9 }, withIds),
    ).toBeNull();
  });
  it("edição que invade a vizinha ainda conflita", () => {
    const conflict = findOverlappingRule({ id: "id-4", rate_min: 0.12, rate_max: 1.01 }, withIds);
    expect(conflict?.label).toBe("Bom");
  });
  it("funciona quando rate_min e rate_max vêm como strings do banco", () => {
    const stringRules = withIds.map((r) => ({
      ...r,
      rate_min: String(r.rate_min) as unknown as number,
      rate_max: String(r.rate_max) as unknown as number,
    }));
    expect(findOverlappingRule({ rate_min: 0.2, rate_max: 0.5 }, stringRules)?.label).toBe("Ótimo");
    expect(findOverlappingRule({ rate_min: 1.01, rate_max: 2 }, stringRules)).toBeNull();
  });
});
