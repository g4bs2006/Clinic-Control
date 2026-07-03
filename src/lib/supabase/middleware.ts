import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          toSet.forEach(({ name, value }) =>
            request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          toSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refreshes the session and checks authentication.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Sem sessão, além do /login: /auth/* (links de e-mail trocam token por
  // sessão) e /ativar-conta (e-mail pré-aprovado define a senha).
  if (
    !user &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/ativar-conta")
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirectResponse = NextResponse.redirect(loginUrl);
    // Preserve cookies so session refresh is not lost on the redirect.
    supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
      redirectResponse.cookies.set(name, value);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
