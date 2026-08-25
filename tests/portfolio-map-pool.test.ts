import { describe, expect, it } from "vitest";
import { mapPool } from "@/lib/utils/pool";

describe("mapPool", () => {
  it("preserva a ordem de entrada", async () => {
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("não excede o limite de promessas em voo", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // realmente rodou em paralelo
  });

  it("lista vazia devolve vazia sem chamar fn", async () => {
    let called = 0;
    const out = await mapPool([], 3, async () => {
      called += 1;
      return 1;
    });
    expect(out).toEqual([]);
    expect(called).toBe(0);
  });
});
