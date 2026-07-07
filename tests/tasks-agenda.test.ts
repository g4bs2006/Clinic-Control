import { describe, expect, it } from "vitest";
import { agendaBucket, spDateParts } from "@/lib/tasks/agenda";

describe("agendaBucket", () => {
  const today = "2026-07-08"; // quarta
  const endOfWeek = "2026-07-12"; // domingo

  it("classifica cada faixa de prazo", () => {
    expect(agendaBucket(null, today, endOfWeek)).toBe("sem_prazo");
    expect(agendaBucket("2026-07-07", today, endOfWeek)).toBe("atrasada");
    expect(agendaBucket("2026-07-08", today, endOfWeek)).toBe("hoje");
    expect(agendaBucket("2026-07-10", today, endOfWeek)).toBe("semana");
    expect(agendaBucket("2026-07-12", today, endOfWeek)).toBe("semana"); // domingo inclui
    expect(agendaBucket("2026-07-13", today, endOfWeek)).toBe("depois");
  });
});

describe("spDateParts", () => {
  it("numa quarta, fim de semana é o domingo seguinte", () => {
    // 2026-07-08 12:00 BRT = 15:00Z; quarta-feira
    const { today, endOfWeek } = spDateParts(new Date("2026-07-08T15:00:00Z"));
    expect(today).toBe("2026-07-08");
    expect(endOfWeek).toBe("2026-07-12");
  });

  it("quando hoje já é domingo, endOfWeek é o próprio dia", () => {
    const { today, endOfWeek } = spDateParts(new Date("2026-07-12T15:00:00Z"));
    expect(today).toBe("2026-07-12");
    expect(endOfWeek).toBe("2026-07-12");
  });

  it("converte para o fuso de São Paulo (noite UTC ainda é o mesmo dia BRT)", () => {
    // 2026-07-08T02:00Z = 2026-07-07 23:00 BRT → ainda dia 7 em SP
    const { today } = spDateParts(new Date("2026-07-08T02:00:00Z"));
    expect(today).toBe("2026-07-07");
  });
});
