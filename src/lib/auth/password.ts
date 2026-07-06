import bcrypt from "bcryptjs";

// bcryptjs verifica os hashes $2a$ herdados do Supabase Auth e gera $2b$.
const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Senha temporária legível (reset pelo gestor) — ex.: "troque-4829-agora". */
export function generateTempPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  const words = ["clinica", "sorriso", "escala", "agenda", "painel", "carteira"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${n}-nova`;
}
