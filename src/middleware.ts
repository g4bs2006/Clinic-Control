import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";
import { verifySessionToken } from "@/lib/auth/token";

// Rotas públicas: só o login (usuários são criados pelo gestor em
// Configurações → Usuários, já com senha temporária).
// /api/reports/process e /api/tasks/generate/process validam a própria
// autenticação (assinatura HMAC interna dos ticks) — ver
// src/app/api/reports/process/route.ts e
// src/app/api/tasks/generate/process/route.ts. Os ticks são chamadas
// servidor-para-servidor sem cookie de sessão, então precisam ficar fora do
// gate abaixo (senão o job fica preso em "queued" para sempre).
// /api/form-credentials é um webhook externo (Google Apps Script / n8n) com auth
// própria via header x-webhook-secret — não pode exigir cookie de sessão.
// /api/automacao/scan é o gatilho do pg_cron semanal (header x-cron-secret).
// /api/helena/overviews-collect é o cron diário do overview (mesmo header).
const PUBLIC_PREFIXES = [
  "/login",
  "/api/reports/process",
  "/api/tasks/generate/process",
  "/api/openai-containment/process",
  "/api/automacao/process",
  "/api/automacao/scan",
  "/api/helena/overviews-collect",
  "/api/form-credentials",
];

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
