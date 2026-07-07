"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPassword, DUMMY_PASSWORD_HASH } from "./password";
import { createSession, destroySession } from "./session";

// Rate limit de login por e-mail: após MAX_ATTEMPTS falhas na janela, bloqueia.
const MAX_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const supabase = createServiceClient();

  // 1) Rate limit: conta falhas recentes deste e-mail.
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentFailures } = await supabase
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("attempted_at", since);
  if ((recentFailures ?? 0) >= MAX_ATTEMPTS) redirect("/login?error=locked");

  // 2) Busca o usuário e SEMPRE roda um bcrypt.compare (contra o hash real ou um
  //    descartável) — assim o tempo de resposta não revela se o e-mail existe.
  const { data } = await supabase
    .from("app_users")
    .select("id, password_hash, active")
    .eq("email", email)
    .maybeSingle();

  const hash = (data?.password_hash as string | null) ?? DUMMY_PASSWORD_HASH;
  const passwordOk = await verifyPassword(password, hash);
  const ok = data != null && data.active === true && passwordOk;

  if (!ok) {
    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    await supabase.from("login_attempts").insert({ email, ip });
    redirect("/login?error=1");
  }

  // 3) Sucesso: limpa as tentativas do e-mail e cria a sessão.
  await supabase.from("login_attempts").delete().eq("email", email);
  await createSession(data!.id as string);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
