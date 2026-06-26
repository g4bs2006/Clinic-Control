import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(keyB64?: string): Buffer {
  const b64 = keyB64 ?? process.env.HELENA_TOKEN_ENC_KEY;
  if (!b64) throw new Error("HELENA_TOKEN_ENC_KEY ausente");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("HELENA_TOKEN_ENC_KEY deve ter 32 bytes (base64)");
  return key;
}

export function encryptToken(plain: string, keyB64?: string): string {
  const key = getKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptToken(payload: string, keyB64?: string): string {
  const key = getKey(keyB64);
  const [ivB64, tagB64, ctB64] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
