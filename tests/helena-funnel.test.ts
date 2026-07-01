import { describe, it, expect } from "vitest";
import { buildLiveFunnel } from "@/lib/helena/funnel";

const steps = [
  { id: "s1", title: "Leads", position: 1, cardCount: 0, monetaryAmount: 0 },
  { id: "s2", title: "Agendados", position: 2, cardCount: 0, monetaryAmount: 0 },
  { id: "s9", title: "Compareceram e Fecharam", position: 9, cardCount: 0, monetaryAmount: 0 },
];
const card = (id: string, stepId: string, amount: number | null = null) =>
  ({ id, stepId, title: id, monetaryAmount: amount, createdAt: "2026-06-10T00:00:00Z" });

describe("buildLiveFunnel", () => {
  it("conta por etapa e calcula taxa", () => {
    const r = buildLiveFunnel(steps, [card("a", "s1"), card("b", "s1"), card("c", "s1"), card("d", "s1"), card("e", "s1"), card("f", "s2")]);
    expect(r.leads).toBe(6); // 6 cards no total
    expect(r.scheduled).toBe(1);
    expect(r.rate).toBeCloseTo(1 / 6);
  });

  it("taxa 0 quando não há leads", () => {
    expect(buildLiveFunnel(steps, []).rate).toBe(0);
  });

  it("soma faturamento da etapa de fechamento", () => {
    const r = buildLiveFunnel(steps, [card("a", "s9", 1000), card("b", "s9", 500), card("c", "s2", 999)]);
    expect(r.revenue).toBe(1500);
  });
});
