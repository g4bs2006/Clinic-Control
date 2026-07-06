import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";
import { verifySessionToken } from "@/lib/auth/token";

// Rotas públicas: login e ativação de conta (e-mail pré-aprovado).
// /api/reports/process valida a própria autenticação (assinatura HMAC interna
// dos ticks de relatório) — ver src/app/api/reports/process/route.ts.
const PUBLIC_PREFIXES = ["/login", "/ativar-conta", "/api/reports/process"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Só assinatura + expiração aqui (Edge, sem banco); o gate real de usuário
  // ativo acontece nas server actions/páginas via getSessionUser().
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = await verifySessionToken(token);
  if (!userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
