import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { listCredentials } from "@/lib/vault/actions";
import { VaultManager } from "@/components/vault/vault-manager";

export default async function CofrePage() {
  // Gate de rota: o middleware só valida sessão; o papel é decidido aqui, uma
  // vez, para a página inteira — qualquer fetch futuro adicionado abaixo já
  // nasce atrás do gate, em vez de depender de cada action se defender.
  const user = await getSessionUser();
  if (!user || user.role !== "gestor") redirect("/");

  const res = await listCredentials();

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold brand-header">Cofre</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Credenciais, tokens e acessos sensíveis da operação, cifrados no banco. Conteúdo
          revelado fica exposto por 30 segundos e cada revelação é registrada.
        </p>
      </div>

      {res.ok ? (
        <VaultManager initialCredentials={res.credentials} />
      ) : (
        <p className="text-sm text-muted-foreground">{res.error}</p>
      )}
    </main>
  );
}
