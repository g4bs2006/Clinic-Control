import { describe, it, expect, vi } from "vitest";
import { listPanels, getPanelWithSteps, listCards } from "@/lib/helena/client";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("listPanels", () => {
  it("mapeia items para HelenaPanel e envia Bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      items: [{ id: "p1", title: "Controle de Leads", key: "CDL", companyId: "c1" }],
      hasMorePages: false,
    })) as unknown as typeof fetch;
    const panels = await listPanels("tok", { fetchImpl });
    expect(panels).toEqual([{ id: "p1", title: "Controle de Leads", key: "CDL", companyId: "c1" }]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/crm/v1/panel");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });
});

describe("getPanelWithSteps", () => {
  it("retorna painel e etapas ordenadas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      id: "p1", title: "Controle de Leads", key: "CDL", companyId: "c1",
      steps: [
        { id: "s2", title: "Agendados", position: 2, cardCount: 3, monetaryAmount: 0 },
        { id: "s1", title: "Leads", position: 1, cardCount: 10, monetaryAmount: 0 },
      ],
    })) as unknown as typeof fetch;
    const { panel, steps } = await getPanelWithSteps("tok", "p1", { fetchImpl });
    expect(panel.title).toBe("Controle de Leads");
    expect(steps.map((s) => s.position)).toEqual([1, 2]);
  });
});

describe("listCards", () => {
  it("segue a paginação até hasMorePages=false", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ items: [{ id: "c1", stepId: "s1", title: "x", monetaryAmount: null, createdAt: "2026-06-01T00:00:00Z" }], hasMorePages: true }))
      .mockResolvedValueOnce(ok({ items: [{ id: "c2", stepId: "s2", title: "y", monetaryAmount: 500, createdAt: "2026-06-02T00:00:00Z" }], hasMorePages: false })) as unknown as typeof fetch;
    const cards = await listCards("tok", "p1", {}, { fetchImpl });
    expect(cards.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("propaga erro HTTP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as unknown as Response) as unknown as typeof fetch;
    await expect(listPanels("tok", { fetchImpl })).rejects.toThrow();
  });
});
