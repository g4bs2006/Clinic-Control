import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetPasswordForm } from "@/components/auth/set-password-form";

// Página pós-convite/recuperação: o usuário já chega com sessão (criada pelo
// /auth/confirm) e define a senha definitiva aqui.
export default async function DefinirSenhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Definir senha</CardTitle>
          <CardDescription>
            Bem-vindo{user.email ? `, ${user.email}` : ""}! Escolha a senha que você
            usará para entrar no Clinic Control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
