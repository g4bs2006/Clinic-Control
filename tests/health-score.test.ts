import { describe, it, expect } from "vitest";
import { computeHealth, type HealthSignals } from "@/lib/health/score";

// Base: clínica com todos os sinais em bom estado.
const base: HealthSignals = {
  bandIndex: 4,
  bandCount: 5, // melhor faixa → conversão 100
  summaries7d: [{ severity: "baixa", churn: false }],
  overdueTasks: 0,
  highPriorityTasks: 0,
  highSeverityAcomp: 0,
  rate: 0.12,
  ratePrev: 0.12,
  responseMedianMin: 10, // ≤15 → 100
};

describe("computeHealth — casos gerais", () => {
  it("clínica saudável com todos os sinais → score alto, confiança alta", () => {
    const r = computeHealth(base);
    expect(r.status).toBe("scored");
    if (r.status !== "scored") return;
    expect(r.coverage).toBeCloseTo(1);
    expect(r.confidence).toBe("alta");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.band).toBe("saudavel");
  });

  it("menção de churn + tarefas atrasadas + queda de taxa → Risco", () => {
    const r = computeHealth({
      ...base,
      bandIndex: 1,
      summaries7d: [{ severity: "alta", churn: true }],
      overdueTasks: 3,
      rate: 0.06,
      ratePrev: 0.12, // queda de 6pts
    });
    expect(r.status).toBe("scored");
    if (r.status !== "scored") return;
    expect(r.band).toBe("risco");
    // o fator de maior drag deve ser o sentimento (churn) ou a conversão
    expect(["sentimento", "conversao"]).toContain(r.factors[0].key);
  });
});

describe("computeHealth — disponibilidade de sinais", () => {
  it("sem grupo (sem sentimento nem resposta) ainda pontua nos demais, confiança média", () => {
    const r = computeHealth({
      ...base,
      summaries7d: [], // sentimento ausente
      responseMedianMin: null, // resposta ausente
    });
    expect(r.status).toBe("scored");
    if (r.status !== "scored") return;
    // presentes: conversão(30)+pendências(20)+tendência(13) = 63%
    expect(r.coverage).toBeCloseTo(0.63, 2);
    expect(r.confidence).toBe("media");
    expect(r.factors.some((f) => f.key === "sentimento")).toBe(false);
  });

  it("sem taxa no mês → insuficiente (não finge saúde)", () => {
    const r = computeHealth({
      ...base,
      bandIndex: null, // conversão ausente
      rate: null,
      ratePrev: null,
      summaries7d: [],
      responseMedianMin: null,
    });
    expect(r.status).toBe("insuficiente");
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
  });
});

describe("computeHealth — componentes isolados", () => {
  it("tendência: queda de taxa penaliza, alta premia (em torno de 50)", () => {
    const caindo = computeHealth({ ...base, rate: 0.08, ratePrev: 0.12 });
    const subindo = computeHealth({ ...base, rate: 0.16, ratePrev: 0.12 });
    const cScore = caindo.status === "scored" && caindo.factors.find((f) => f.key === "tendencia")!.score;
    const sScore = subindo.status === "scored" && subindo.factors.find((f) => f.key === "tendencia")!.score;
    expect(cScore).toBeLessThan(50);
    expect(sScore).toBeGreaterThan(50);
  });

  it("pendências: cada atrasada tira 15 pontos", () => {
    const r = computeHealth({ ...base, overdueTasks: 2 });
    const p = r.status === "scored" && r.factors.find((f) => f.key === "pendencias")!.score;
    expect(p).toBe(70); // 100 - 2*15
  });

  it("resposta lenta (>2h) zera o componente", () => {
    const r = computeHealth({ ...base, responseMedianMin: 180 });
    const resp = r.status === "scored" && r.factors.find((f) => f.key === "resposta")!.score;
    expect(resp).toBe(0);
  });
});
