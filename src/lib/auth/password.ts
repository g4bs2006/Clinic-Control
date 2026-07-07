import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

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

// Hash "descartável" contra o qual o login compara quando o e-mail não existe —
// mantém o tempo de resposta ~constante e evita enumeração de usuários por timing.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-attack-mitigation", ROUNDS);

/**
 * Senha temporária legível (reset pelo gestor) — ex.: "clinica-k7m2np9q".
 * Usa RNG criptográfico e ~40 bits de entropia (8 chars base32 sem ambíguos),
 * suficiente para resistir a força bruta mesmo com o prefixo de palavra fixo.
 */
export function generateTempPassword(): string {
  const words = ["clinica", "sorriso", "escala", "agenda", "painel", "carteira"];
  const word = words[randomInt(words.length)];
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz"; // sem 0/1/o/l/i (ambíguos)
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `${word}-${suffix}`;
}
