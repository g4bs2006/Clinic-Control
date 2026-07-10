import { listHelenaAccounts } from "@/lib/helena/accounts-actions"
import { listClinics } from "@/lib/clinics/actions"
import { listUnintegratedClinics } from "@/lib/helena/link-actions"
import { getCarteiraScope } from "@/lib/users/actions"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { HelenaSyncButton } from "@/components/helena/helena-sync-button"
import { HelenaAccountsTable } from "@/components/helena/helena-accounts-table"

export const dynamic = "force-dynamic"

export default async function HelenaAccountsPage() {
  const [accounts, clinics, unintegratedClinics, scope] = await Promise.all([
    listHelenaAccounts(),
    listClinics(),
    listUnintegratedClinics(),
    getCarteiraScope(),
  ])
  const clinicNameById = new Map(clinics.map((c) => [c.id, c.name]))

  const linked = accounts.filter((a) => a.clinic_id)
  const production = accounts.filter((a) => a.setup_status === "PRODUCTION" && a.active)
  const withWebhooks = accounts.filter((a) => (a.webhooks?.length ?? 0) > 0)
  const lastSync = accounts.reduce<string | null>(
    (max, a) => (max === null || a.synced_at > max ? a.synced_at : max),
    null,
  )

  return (
    <main className="p-4 space-y-6 sm:p-6 max-w-screen-2xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold brand-header">Contas Helena</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            todas as contas do parceiro Contact.IA · tokens e webhooks por conta
            {lastSync && (
              <span className="ml-1">
                · sincronizado em {new Date(lastSync).toLocaleString("pt-BR")}
              </span>
            )}
          </p>
        </div>
        <HelenaSyncButton />
      </div>

      {accounts.length === 0 ? (
        <Panel title="Nenhuma conta sincronizada">
          <p className="text-sm text-muted-foreground">
            Clique em “Sincronizar com a Helena” para importar as contas do parceiro
            (dados cadastrais, plano, tokens e webhooks).
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Contas na Helena" value={String(accounts.length)} accent="teal" />
            <KpiCard
              label="Vinculadas a clínicas"
              value={`${linked.length} / ${accounts.length}`}
              accent="purple"
            />
            <KpiCard label="Em produção" value={String(production.length)} />
            <KpiCard
              label="Com webhooks ativos"
              value={String(withWebhooks.length)}
              accent="rose"
            />
          </div>

          <Panel
            title="Matriz de contas"
            subtitle="conta na Helena · clínica vinculada · plano · tokens · webhooks"
          >
            <HelenaAccountsTable
              accounts={accounts}
              clinicNameById={clinicNameById}
              unintegratedClinics={unintegratedClinics}
              profile={scope.profile}
              developerOptions={scope.developerOptions}
            />
          </Panel>
        </>
      )}
    </main>
  )
}
