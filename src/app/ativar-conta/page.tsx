import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActivateAccountForm } from "@/components/auth/activate-account-form";

// "Novo por aqui?" — quem teve o e-mail pré-aprovado pelo gestor define a
// senha aqui e já entra no sistema. Página pública (sem sessão).
export default function AtivarContaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Ativar conta</CardTitle>
          <CardDescription>
            Informe o e-mail que o gestor cadastrou para você e escolha sua senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActivateAccountForm />
          <p className="text-center text-xs text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
