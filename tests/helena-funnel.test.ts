import { describe, it, expect } from "vitest";
import { buildLiveFunnel, buildDailyFunnel } from "@/lib/helena/funnel";

const steps = [
  { id: "s1", title: "Leads", position: 1, cardCount: 0, monetaryAmount: 0 },
  { id: "s2", title: "Agendados", position: 2, cardCount: 0, monetaryAmount: 0 },
  { id: "s3", title: "Não Agendados", position: 3, cardCount: 0, monetaryAmount: 0 },
  { id: "s4", title: "Reagendados", position: 4, cardCount: 0, monetaryAmount: 0 },
  { id: "s5", title: "Cancelados", position: 5, cardCount: 0, monetaryAmount: 0 },
  { id: "s6", title: "Faltosos", position: 6, cardCount: 0, monetaryAmount: 0 },
  { id: "s7", title: "Orçamento em Aberto", position: 7, cardCount: 0, monetaryAmount: 0 },
  { id: "s8", title: "Compareceram e Não Fecharam", position: 8, cardCount: 0, monetaryAmount: 0 },
  { id: "s9", title: "Compareceram e Fecharam", position: 9, cardCount: 0, monetaryAmount: 0 },
];
const card = (id: string, stepId: string, amount: number | null = null, createdAt = "2026-06-10T00:00:00Z") =>
  ({ id, stepId, title: id, monetaryAmount: amount, createdAt });

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

  it("conta agendado cumulativamente: quem avançou no funil continua contando", () => {
    // 9 leads; 1 parado em Agendados, 1 em Reagendados, 1 em Faltosos,
    // 1 em Orçamento em Aberto, 1 em Compareceram e Não Fecharam,
    // 1 em Compareceram e Fecharam = 6 "agendaram" em algum momento.
    // Não Agendados e Cancelados NÃO contam.
    const r = buildLiveFunnel(steps, [
      card("a", "s1"), card("b", "s1"), // Leads puros
      card("c", "s2"), // Agendados
      card("d", "s3"), // Não Agendados
      card("e", "s4"), // Reagendados
      card("f", "s5"), // Cancelados
      card("g", "s6"), // Faltosos
      card("h", "s7"), // Orçamento em Aberto
      card("i", "s8"), // Compareceram e Não Fecharam
      card("j", "s9"), // Compareceram e Fecharam
    ]);
    expect(r.leads).toBe(10);
    expect(r.scheduled).toBe(6);
  });
});

describe("buildDailyFunnel", () => {
  const today = new Date("2026-06-15T12:00:00Z");

  it("bucketiza por dia e preenche até hoje no mês corrente", () => {
    const points = buildDailyFunnel(
      steps,
      [
        card("a", "s1", null, "2026-06-01T10:00:00Z"),
        card("b", "s2", null, "2026-06-01T14:00:00Z"),
        card("c", "s1", null, "2026-06-03T09:00:00Z"),
      ],
      "2026-06",
      today,
    );
    expect(points).toHaveLength(15); // até o dia 15 (today), não o mês inteiro
    expect(points[0]).toEqual({ day: "2026-06-01", leads: 2, scheduled: 1, rate: 0.5 });
    expect(points[1]).toEqual({ day: "2026-06-02", leads: 0, scheduled: 0, rate: null });
    expect(points[2]).toEqual({ day: "2026-06-03", leads: 1, scheduled: 0, rate: 0 });
  });

  it("mês passado preenche todos os dias do mês", () => {
    const points = buildDailyFunnel(steps, [], "2026-04", today);
    expect(points).toHaveLength(30); // abril tem 30 dias
    expect(points.every((p) => p.rate === null)).toBe(true);
  });

  it("Compareceram e Fecharam conta como agendado no dia em que o card foi criado", () => {
    const points = buildDailyFunnel(
      steps,
      [card("a", "s9", null, "2026-06-05T08:00:00Z")],
      "2026-06",
      today,
    );
    const day5 = points.find((p) => p.day === "2026-06-05");
    expect(day5).toEqual({ day: "2026-06-05", leads: 1, scheduled: 1, rate: 1 });
  });
});
