import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVISION_OPTIONS,
  HELENA_APPS,
  normalizeProvisionOptions,
} from "@/lib/helena/provision-options";

describe("normalizeProvisionOptions", () => {
  it("null/undefined caem nos defaults (apps nunca vazio — a API exige)", () => {
    for (const raw of [null, undefined, {}, { apps: [] }]) {
      const opts = normalizeProvisionOptions(raw);
      expect(opts.apps).toEqual(DEFAULT_PROVISION_OPTIONS.apps);
      expect(opts.config).toEqual(DEFAULT_PROVISION_OPTIONS.config);
    }
  });

  it("filtra valores fora do enum e números inválidos", () => {
    const opts = normalizeProvisionOptions({
      apps: ["PANEL", "HACKED", "AI_AGENT"],
      resourcers: ["WEBHOOK_API", "NOPE"],
      config: { whatsAppChannels: "2", panels: -1, invented: 5, session: 1000.9 },
      companyType: "PIRATA",
    });
    expect(opts.apps).toEqual(["PANEL", "AI_AGENT"]);
    expect(opts.resourcers).toEqual(["WEBHOOK_API"]);
    expect(opts.config).toEqual({ whatsAppChannels: 2, session: 1000 });
    expect(opts.companyType).toBe("LIMITED"); // inválido cai no default
  });

  it("preserva escolhas válidas do usuário sem alterar", () => {
    const chosen = {
      apps: ["PANEL"],
      resourcers: [],
      config: { whatsAppChannels: 5, panels: 2 },
      companyType: "MEI",
    };
    expect(normalizeProvisionOptions(chosen)).toEqual(chosen);
  });

  it("defaults só contêm valores do enum", () => {
    const valid = new Set<string>(HELENA_APPS.map((a) => a.value));
    for (const app of DEFAULT_PROVISION_OPTIONS.apps) {
      expect(valid.has(app)).toBe(true);
    }
  });
});
