import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "cct_";
/** Chars exibidos na lista de tokens — o suficiente pra distinguir, não pra adivinhar. */
const DISPLAY_PREFIX_LEN = TOKEN_PREFIX.length + 8;

/**
 * SHA-256, não bcrypt: o token já nasce com 256 bits de entropia (ao contrário
 * de senha, que é baixa entropia e precisa de hash lento contra força bruta).
 * O que importa aqui é lookup indexado O(1) por hash — bcrypt teria salt por
 * linha e exigiria comparar contra cada token existente.
 */
export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    hash: hashApiToken(token),
    prefix: token.slice(0, DISPLAY_PREFIX_LEN),
  };
}
