import { describe, it, expect } from "vitest";
import { AtSign, Bell } from "lucide-react";
import { notificationVisual, dayBucket } from "@/lib/notifications/display";

describe("notificationVisual", () => {
  it("mapeia 'mention' para AtSign", () => {
    expect(notificationVisual("mention").Icon).toBe(AtSign);
  });
  it("usa fallback Bell para tipo desconhecido", () => {
    const v = notificationVisual("tipo_que_nao_existe");
    expect(v.Icon).toBe(Bell);
    expect(v.colorClass).toBe("text-muted-foreground");
  });
});

describe("dayBucket (fuso America/Sao_Paulo)", () => {
  // now fixo: 2026-07-24 12:00 em São Paulo (UTC-3) = 15:00Z
  const now = new Date("2026-07-24T15:00:00Z");

  it("mesmo dia => hoje", () => {
    expect(dayBucket("2026-07-24T09:00:00Z", now)).toBe("hoje");
  });
  it("dia anterior => ontem", () => {
    expect(dayBucket("2026-07-23T18:00:00Z", now)).toBe("ontem");
  });
  it("3 dias atrás => semana", () => {
    expect(dayBucket("2026-07-21T12:00:00Z", now)).toBe("semana");
  });
  it("10 dias atrás => antes", () => {
    expect(dayBucket("2026-07-14T12:00:00Z", now)).toBe("antes");
  });
  it("madrugada UTC que ainda é ontem em SP => ontem", () => {
    // 2026-07-24T02:00:00Z = 2026-07-23 23:00 em SP => é 'ontem' relativo ao now
    expect(dayBucket("2026-07-24T02:00:00Z", now)).toBe("ontem");
  });
});
