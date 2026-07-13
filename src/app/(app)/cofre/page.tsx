import { listCredentials } from "@/lib/vault/actions";
import { VaultManager } from "@/components/vault/vault-manager";

export default async function CofrePage() {
  const res = await listCredentials();

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold brand-header">Cofre de credenciais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Logins e segredos dos serviços externos usados pela operação. Segredos ficam cifrados
          no banco e só são revelados por gestores — cada revelação é registrada.
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
