import { describe, it, expect } from "vitest";
import { lastDue, freqLabel } from "@/lib/tasks/recurrence";
import {
  similarity,
  greedyClusters,
  detectCadence,
  detectRoutines,
  onboardingThemes,
  clusterSignature,
} from "@/lib/tasks/clustering";

// ── lastDue: matemática do calendário ───────────────────────────────────────

describe("lastDue", () => {
  it("diária: sempre hoje", () => {
    expect(lastDue({ freq: "diaria", weekday: null, monthday: null }, "2026-07-10")).toBe("2026-07-10");
  });

  it("semanal: a segunda-feira mais recente", () => {
    // 2026-07-10 é sexta; weekday 1 = segunda → 2026-07-06
    expect(lastDue({ freq: "semanal", weekday: 1, monthday: null }, "2026-07-10")).toBe("2026-07-06");
    // no próprio dia: sexta (5) → hoje
    expect(lastDue({ freq: "semanal", weekday: 5, monthday: null }, "2026-07-10")).toBe("2026-07-10");
  });

  it("mensal: dia 1 → 1º do mês corrente quando já passou", () => {
    expect(lastDue({ freq: "mensal", weekday: null, monthday: 1 }, "2026-07-10")).toBe("2026-07-01");
  });

  it("mensal: dia 15 antes do dia 15 → mês anterior", () => {
    expect(lastDue({ freq: "mensal", weekday: null, monthday: 15 }, "2026-07-10")).toBe("2026-06-15");
  });

  it("mensal: dia 31 em mês curto ajusta pro último dia", () => {
    // hoje 2026-07-10; dia 31 de junho não existe → 30/06
    expect(lastDue({ freq: "mensal", weekday: null, monthday: 31 }, "2026-07-10")).toBe("2026-06-30");
  });

  it("regra malformada retorna null", () => {
    expect(lastDue({ freq: "semanal", weekday: null, monthday: null }, "2026-07-10")).toBeNull();
  });

  it("freqLabel legível", () => {
    expect(freqLabel({ freq: "semanal", weekday: 1, monthday: null })).toBe("Semanal · segunda");
    expect(freqLabel({ freq: "mensal", weekday: null, monthday: 5 })).toBe("Mensal · dia 5");
  });
});

// ── clustering ───────────────────────────────────────────────────────────────

describe("similarity + clusters", () => {
  it("títulos parecidos (acentos/variações) têm similaridade alta", () => {
    expect(similarity("Conferir leads não respondidos", "conferir leads nao respondidos")).toBeGreaterThan(0.9);
    expect(similarity("Conferir painel da clínica", "Ajustar horário de funcionamento")).toBeLessThan(0.3);
  });

  it("agrupa variações no mesmo cluster", () => {
    const items = [
      { id: "1", title: "Conferir leads não respondidos", clinicId: "c1", day: "2026-06-12" },
      { id: "2", title: "Conferir leads nao respondidos ", clinicId: "c1", day: "2026-06-19" },
      { id: "3", title: "Ajustar etiquetas do painel", clinicId: "c1", day: "2026-06-20" },
    ];
    const clusters = greedyClusters(items, 0.5);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].items).toHaveLength(2);
  });
});

describe("detectCadence", () => {
  it("ritmo semanal com tolerância (7±2 dias)", () => {
    const c = detectCadence(["2026-06-12", "2026-06-19", "2026-06-27", "2026-07-03"]);
    expect(c?.freq).toBe("semanal");
    expect(c?.occurrences).toBe(4);
  });

  it("menos de 3 ocorrências não é ritmo", () => {
    expect(detectCadence(["2026-06-12", "2026-06-19"])).toBeNull();
  });

  it("intervalos irregulares não são ritmo", () => {
    expect(detectCadence(["2026-06-01", "2026-06-03", "2026-06-25"])).toBeNull();
  });

  it("mensal (~30 dias)", () => {
    expect(detectCadence(["2026-04-01", "2026-05-02", "2026-06-01"])?.freq).toBe("mensal");
  });
});

describe("detectRoutines (lente 1)", () => {
  const base = [
    { id: "1", title: "Conferir leads não respondidos", clinicId: "c1", day: "2026-06-12" },
    { id: "2", title: "Conferir leads nao respondidos", clinicId: "c1", day: "2026-06-19" },
    { id: "3", title: "Conferir leads não respondidos", clinicId: "c1", day: "2026-06-26" },
    { id: "4", title: "Conferir leads não respondidos", clinicId: "c1", day: "2026-07-03" },
  ];

  it("detecta rotina semanal ativa", () => {
    const routines = detectRoutines(base, "2026-07-10");
    expect(routines).toHaveLength(1);
    expect(routines[0].cadence.freq).toBe("semanal");
    expect(routines[0].clinicId).toBe("c1");
  });

  it("ritmo morto (última ocorrência antiga demais) não é sugerido", () => {
    expect(detectRoutines(base, "2026-09-01")).toHaveLength(0);
  });

  it("assinatura estável para memória de rejeição", () => {
    expect(clusterSignature("c1", "Conferir Leads NÃO respondidos")).toBe("c1|conferir leads nao respondidos");
  });
});

describe("onboardingThemes (lente 2)", () => {
  it("tema em ≥2 clínicas aparece; caso isolado não", () => {
    const themes = onboardingThemes([
      { id: "1", title: "Ajustar etiquetas do painel", clinicId: "c1", day: "2026-06-10", dayOfLife: 8 },
      { id: "2", title: "Ajustar etiquetas do painel da clínica", clinicId: "c2", day: "2026-06-15", dayOfLife: 12 },
      { id: "3", title: "Corrigir etiquetas painel", clinicId: "c3", day: "2026-06-20", dayOfLife: 20 },
      { id: "4", title: "Trocar logo do perfil", clinicId: "c1", day: "2026-06-11", dayOfLife: 9 },
    ]);
    expect(themes).toHaveLength(1);
    expect(themes[0].clinicsCount).toBe(3);
    expect(themes[0].dayRange).toEqual([8, 20]);
  });
});
