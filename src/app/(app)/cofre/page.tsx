import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { listCredentials } from "@/lib/vault/actions";
import { VaultManager } from "@/components/vault/vault-manager";

export default async function CofrePage() {
  // O cofre abre para qualquer usuário autenticado; o RECORTE é por papel:
  // desenvolvedor só recebe itens visible_to_devs (filtrado no servidor, em
  // listCredentials/revealSecret) e não vê ações de gestão. isGestor aqui é
  // só para a UI — a autorização real vive nas actions.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const isGestor = user.role === "gestor";

  const res = await listCredentials();

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold brand-header">Cofre</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isGestor
            ? "Credenciais, tokens e acessos sensíveis da operação, cifrados no banco. Conteúdo revelado fica exposto por 30 segundos e cada revelação é registrada."
            : "Acessos que o gestor compartilhou com a equipe, cifrados no banco. Conteúdo revelado fica exposto por 30 segundos e cada revelação é registrada."}
        </p>
      </div>

      {res.ok ? (
        <VaultManager initialCredentials={res.credentials} isGestor={isGestor} />
      ) : (
        <p className="text-sm text-muted-foreground">{res.error}</p>
      )}
    </main>
  );
}
