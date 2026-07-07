import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth/token";
import { hashPassword, verifyPassword, generateTempPassword } from "@/lib/auth/password";

const SECRET = "teste-secreto-com-mais-de-32-caracteres!";
const OUTRO = "outro-secreto-tambem-com-32-caracteres!!";

describe("token de sessão", () => {
  it("assina e verifica", async () => {
    const exp = Date.now() + 60_000;
    const token = await signSessionToken("user-123", exp, SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe("user-123");
  });

  it("rejeita token expirado", async () => {
    const token = await signSessionToken("user-123", Date.now() - 1000, SECRET);
    expect(await verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejeita assinatura de outro secret", async () => {
    const token = await signSessionToken("user-123", Date.now() + 60_000, OUTRO);
    expect(await verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejeita token adulterado (troca de userId)", async () => {
    const token = await signSessionToken("user-123", Date.now() + 60_000, SECRET);
    const [v, , exp, sig] = token.split(".");
    expect(await verifySessionToken(`${v}.user-456.${exp}.${sig}`, SECRET)).toBeNull();
  });

  it("rejeita lixo", async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
    expect(await verifySessionToken("", SECRET)).toBeNull();
    expect(await verifySessionToken("a.b.c", SECRET)).toBeNull();
    expect(await verifySessionToken("v1.x.naonum.sig", SECRET)).toBeNull();
  });
});

describe("senha", () => {
  it("hash e verificação", async () => {
    const hash = await hashPassword("minha-senha-8");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("minha-senha-8", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
  });

  it("verifica hash $2a$ (formato herdado do Supabase Auth)", async () => {
    // Hash bcrypt $2a$ pré-computado de "senha-legada" (10 rounds).
    const legacy = "$2a$10$kil3DbhvVOc9aRRfTQ8LuOAZHaWuXVjIqKFW2U0PMzWtFCa2p1aOy";
    expect(await verifyPassword("senha-legada", legacy)).toBe(true);
    expect(await verifyPassword("outra", legacy)).toBe(false);
  });

  it("hash nulo nunca verifica", async () => {
    expect(await verifyPassword("qualquer", null)).toBe(false);
  });

  it("senha temporária: palavra + 8 chars base32 sem ambíguos, com entropia", () => {
    const p = generateTempPassword();
    expect(p).toMatch(/^[a-z]+-[2-9a-hjkmnp-z]{8}$/);
    // duas gerações não colidem (RNG criptográfico, ~40 bits)
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});
