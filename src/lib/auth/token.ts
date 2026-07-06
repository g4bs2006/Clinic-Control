// Token de sessão assinado (HMAC-SHA256 via Web Crypto) — funciona tanto no
// runtime Node quanto no Edge (middleware). Formato: v1.<userId>.<expMs>.<sig>.
// Sem dependência de next/headers: os helpers de cookie ficam em session.ts.

const VERSION = "v1";

function getSecret(secret?: string): string {
  const s = secret ?? process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET ausente ou muito curto (mínimo 32 caracteres)");
  }
  return s;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function signSessionToken(
  userId: string,
  expiresAtMs: number,
  secret?: string,
): Promise<string> {
  const payload = `${VERSION}.${userId}.${expiresAtMs}`;
  const key = await hmacKey(getSecret(secret));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Valida assinatura e expiração; retorna o userId ou null. */
export async function verifySessionToken(
  token: string | undefined | null,
  secret?: string,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, userId, expStr, sigB64] = parts;

  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;

  const sig = fromBase64Url(sigB64);
  if (!sig) return null;

  const key = await hmacKey(getSecret(secret));
  const payload = `${VERSION}.${userId}.${expStr}`;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig as BufferSource,
    new TextEncoder().encode(payload),
  );
  return valid ? userId : null;
}
