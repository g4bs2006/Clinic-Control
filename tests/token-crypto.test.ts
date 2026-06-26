import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken } from "@/lib/crypto/token";

const key = randomBytes(32).toString("base64");

describe("token crypto", () => {
  it("faz round-trip (decrypt(encrypt(x)) === x)", () => {
    const plain = "pn_abc123TOKEN";
    const enc = encryptToken(plain, key);
    expect(enc).not.toContain(plain);
    expect(decryptToken(enc, key)).toBe(plain);
  });

  it("gera ciphertext diferente a cada chamada (IV aleatório)", () => {
    expect(encryptToken("x", key)).not.toBe(encryptToken("x", key));
  });

  it("falha ao decifrar com chave errada", () => {
    const enc = encryptToken("x", key);
    const other = randomBytes(32).toString("base64");
    expect(() => decryptToken(enc, other)).toThrow();
  });
});
