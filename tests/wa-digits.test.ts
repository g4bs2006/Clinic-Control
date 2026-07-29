import { describe, it, expect } from "vitest";
import { waDigits, waLink } from "@/lib/clinics/partner-contacts";

describe("waDigits", () => {
  it("assume DDI 55 quando vem só DDD + número", () => {
    expect(waDigits("(11) 98765-4321")).toBe("5511987654321");
    expect(waDigits("1133334444")).toBe("551133334444"); // fixo, 10 dígitos
  });

  it("preserva o DDI quando já vem (12+ dígitos)", () => {
    expect(waDigits("+55 11 98765-4321")).toBe("5511987654321");
    expect(waDigits("+351 912 345 678")).toBe("351912345678");
  });

  // Limitação conhecida e aceita: a regra é "≤11 dígitos = número brasileiro",
  // porque a carteira é toda no Brasil (10 = fixo com DDD, 11 = celular). Um
  // estrangeiro de 11 dígitos, como um +1 americano, recebe 55 indevidamente.
  // Documentado aqui para não parecer bug: mudar isso exigiria saber o país.
  it("assume Brasil em qualquer número de até 11 dígitos, inclusive estrangeiro", () => {
    expect(waDigits("+1 415 555 0123")).toBe("5514155550123");
  });

  it("rejeita o que é curto demais para ser telefone", () => {
    expect(waDigits("98765")).toBeNull();
    expect(waDigits("")).toBeNull();
    expect(waDigits(null)).toBeNull();
    expect(waDigits(undefined)).toBeNull();
  });
});

describe("waLink", () => {
  it("monta o wa.me sobre os mesmos dígitos", () => {
    expect(waLink("(11) 98765-4321")).toBe("https://wa.me/5511987654321");
  });

  it("é null quando o telefone não serve", () => {
    expect(waLink("123")).toBeNull();
  });
});
