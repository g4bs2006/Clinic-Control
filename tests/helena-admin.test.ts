import { describe, expect, it, vi } from "vitest";
import { createCompany, createCompanyToken } from "@/lib/helena/admin";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

const BASE_INPUT = {
  name: "Clínica Teste",
  legalName: "Teste LTDA",
  documentId: "12.345.678/0001-90",
  owner: { name: "Dr. Teste", email: "dr@teste.com", phoneNumber: "62999" },
  apps: ["PANEL", "WEBHOOK"],
  resourcers: ["WEBHOOK_API"],
  config: { whatsAppChannels: 2, panels: 1 },
};

describe("createCompany", () => {
  it("monta o payload com documentType inferido, apps/resourcers/config e sem address", async () => {
    const fetchImpl = mockFetch(200, { id: "comp-1" });
    const result = await createCompany("master", BASE_INPUT, { fetchImpl });
    expect(result.id).toBe("comp-1");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.helena.run/core/v1/company");
    const body = JSON.parse(init.body);
    expect(body.documentType).toBe("CNPJ");
    expect(body.documentId).toBe("12345678000190"); // só dígitos
    expect(body.status).toBe("ONBOARDING");
    expect(body.apps).toEqual(["PANEL", "WEBHOOK"]);
    expect(body.resourcers).toEqual(["WEBHOOK_API"]);
    expect(body.config).toEqual({ whatsAppChannels: 2, panels: 1 });
    // address exige CEP na Helena — nunca enviamos
    expect(body.address).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer master");
  });

  it("CPF com 11 dígitos e config omitido quando vazio", async () => {
    const fetchImpl = mockFetch(200, { id: "comp-2" });
    await createCompany(
      "m",
      { name: "X", documentId: "123.456.789-09", apps: ["PANEL"], resourcers: [], config: {} },
      { fetchImpl },
    );
    const body = JSON.parse(
      (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.documentType).toBe("CPF");
    expect(body.config).toBeUndefined();
    expect(body.resourcers).toEqual([]);
  });

  it("erro quando a resposta não traz id", async () => {
    const fetchImpl = mockFetch(200, { ok: true });
    await expect(
      createCompany("m", { name: "X", apps: ["PANEL"], resourcers: [] }, { fetchImpl }),
    ).rejects.toThrow(/sem id/);
  });

  it("erro da Helena vira mensagem legível a partir do envelope {key, text}", async () => {
    const fetchImpl = mockFetch(500, {
      key: "FORM_ERROR",
      text: "CEP não pode ser vazio",
      httpStatusCode: "INTERNALSERVERERROR",
    });
    await expect(
      createCompany("m", { name: "X", apps: ["PANEL"], resourcers: [] }, { fetchImpl }),
    ).rejects.toThrow(/500 \[FORM_ERROR\]: CEP não pode ser vazio/);
  });

  it("erro HTTP sem envelope propaga status e corpo cru", async () => {
    const fetchImpl = mockFetch(500, { message: "boom" });
    await expect(
      createCompany("m", { name: "X", apps: ["PANEL"], resourcers: [] }, { fetchImpl }),
    ).rejects.toThrow(/500/);
  });
});

describe("createCompanyToken", () => {
  it("extrai o token dos campos usuais", async () => {
    for (const body of [{ token: "pn_1" }, { value: "pn_1" }, { accessToken: "pn_1" }]) {
      const fetchImpl = mockFetch(200, body);
      expect(await createCompanyToken("m", "comp-1", "Clinic Control", { fetchImpl })).toBe("pn_1");
    }
  });

  it("usa o endpoint da conta correta", async () => {
    const fetchImpl = mockFetch(200, { token: "pn_2" });
    await createCompanyToken("m", "abc-123", "Nome", { fetchImpl });
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.helena.run/core/v1/company/abc-123/tokens");
  });

  it("erro quando não há token na resposta", async () => {
    const fetchImpl = mockFetch(200, { id: "t1" });
    await expect(createCompanyToken("m", "c", "n", { fetchImpl })).rejects.toThrow(/sem o token/);
  });
});
