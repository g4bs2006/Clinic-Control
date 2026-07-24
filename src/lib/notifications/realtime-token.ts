import "server-only";

// Emite um JWT curto que o Realtime do Supabase aceita, a PARTIR da nossa sessão
// própria (não usamos Supabase Auth). Claims mínimas: sub = app_user.id e
// role "authenticated" — é o que o RLS (auth.uid()) e o Realtime Authorization
// leem. Assinado com o JWT secret do projeto (HS256).
//
// Se SUPABASE_JWT_SECRET não estiver definido, devolve null: o sino cai no
// fallback de polling e nada quebra. Basta adicionar o segredo pra ligar o push.
//
// Obs.: se o projeto tiver migrado só para chaves assimétricas, trocar por
// assinatura RS256/ES256 com a chave privada.

const enc = new TextEncoder();

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function segment(obj: unknown): string {
  return bytesToB64Url(enc.encode(JSON.stringify(obj)));
}

export async function mintRealtimeToken(userId: string, ttlSeconds = 3600): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + ttlSeconds,
  };
  const signingInput = `${segment(header)}.${segment(payload)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${bytesToB64Url(new Uint8Array(sig))}`;
}
