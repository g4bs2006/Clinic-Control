import { describe, it, expect, vi } from "vitest";
import { geocodeAddress } from "@/lib/geocoding/nominatim";

describe("geocodeAddress", () => {
  it("retorna lat/lng do primeiro resultado", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "-23.55", lon: "-46.63" }],
    }) as unknown as typeof fetch;
    const r = await geocodeAddress("Av Paulista, São Paulo", fakeFetch);
    expect(r).toEqual({ lat: -23.55, lng: -46.63 });
  });
  it("retorna null quando não há resultados", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    expect(await geocodeAddress("rua inexistente zzz", fakeFetch)).toBeNull();
  });
  it("retorna null em erro HTTP", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => [] }) as unknown as typeof fetch;
    expect(await geocodeAddress("x", fakeFetch)).toBeNull();
  });
});
