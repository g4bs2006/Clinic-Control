"use server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPassword } from "./password";
import { createSession, destroySession } from "./session";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("app_users")
    .select("id, password_hash, active")
    .eq("email", email)
    .maybeSingle();

  const ok =
    data != null &&
    data.active === true &&
    (await verifyPassword(password, data.password_hash as string | null));
  if (!ok) redirect("/login?error=1");

  await createSession(data!.id as string);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
