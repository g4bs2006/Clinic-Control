import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { listCredentials } from "@/lib/vault/actions";
import { listVaultFiles } from "@/lib/vault/files-actions";
import { VaultTabs } from "@/components/vault/vault-tabs";

export default async function CofrePage() {
  // O cofre abre para qualquer usuário autenticado; o RECORTE é por papel:
  // desenvolvedor só recebe itens/arquivos compartilhados (filtrado no servidor)
  // e não vê ações de gestão. isGestor aqui é só para a UI — a autorização real
  // vive nas actions.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const isGestor = user.role === "gestor";

  const [credsRes, filesRes] = await Promise.all([listCredentials(), listVaultFiles()]);

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold brand-header">Cofre</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isGestor
            ? "Senhas, tokens e arquivos sensíveis da operação. Segredos ficam cifrados no banco; arquivos ficam num bucket privado. Toda revelação e download é registrado."
            : "Acessos e arquivos que o gestor compartilhou com a equipe. Toda revelação e download é registrado."}
        </p>
      </div>

      {credsRes.ok ? (
        <VaultTabs
          credentials={credsRes.credentials}
          files={filesRes.ok ? filesRes.files : []}
          filesMeta={filesRes.ok ? filesRes.meta : {}}
          isGestor={isGestor}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{credsRes.error}</p>
      )}
    </main>
  );
}
