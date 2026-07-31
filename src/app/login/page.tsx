import { headers } from "next/headers";
import { SESSION_DAYS } from "@/lib/auth/session";
import { LoginScreen } from "@/components/login/login-screen";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * Em qual implantação esta tela está rodando, derivado do host da própria
 * request. Não é enfeite: Vercel e VPS rodam em PARALELO contra o mesmo banco
 * (ver clinic-control-vps-hostinger), e saber em qual delas você está antes de
 * entrar já evitou confusão mais de uma vez. Sem correspondência, não inventa
 * rótulo — a faixa simplesmente omite o item.
 */
function deployLabel(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (h.includes("localhost") || h.startsWith("127.0.0.1")) return "Local";
  if (h.includes("vercel.app")) return "Vercel";
  if (h.includes("clinic.control.contactia.com.br")) return "VPS";
  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error =
    params.error === "locked" ? "locked" : params.error === "1" ? "invalid" : null;

  return (
    <LoginScreen
      error={error}
      deploy={deployLabel((await headers()).get("host"))}
      sessionDays={SESSION_DAYS}
    />
  );
}
