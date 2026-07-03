import Link from "next/link"
import { listHelenaAccounts, type HelenaAccountRow } from "@/lib/helena/accounts-actions"
import { listClinics } from "@/lib/clinics/actions"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { HelenaSyncButton } from "@/components/helena/helena-sync-button"

export const dynamic = "force-dynamic"

const SETUP_LABEL: Record<string, { label: string; cls: string }> = {
  PRODUCTION: { label: "Produção", cls: "bg-emerald-500/15 text-emerald-400" },
  COMPLETED: { label: "Configurada", cls: "bg-emerald-500/15 text-emerald-400" },
  PENDING_CONFIG: { label: "Config. pendente", cls: "bg-amber-500/15 text-amber-400" },
  SUBSCRIPTION_PENDING: { label: "Assinatura pendente", cls: "bg-amber-500/15 text-amber-400" },
  SUBSCRIPTION_CREATED: { label: "Assinatura criada", cls: "bg-zinc-500/15 text-zinc-400" },
  SUBSCRIPTION_ARREARS: { label: "Em atraso", cls: "bg-red-500/15 text-red-400" },
  SUBSCRIPTION_SUSPENDED: { label: "Suspensa", cls: "bg-red-500/15 text-red-400" },
  SUBSCRIPTION_CANCELED: { label: "Cancelada", cls: "bg-red-500/15 text-red-400" },
}

function setupBadge(row: HelenaAccountRow) {
  const s = SETUP_LABEL[row.setup_status ?? ""] ?? {
    label: row.setup_status ?? "—",
    cls: "bg-zinc-500/15 text-zinc-400",
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  )
}

function resourcesLabel(row: HelenaAccountRow): string {
  const r = row.config?.resources
  if (!r) return "—"
  const parts: string[] = []
  if (r.includedAgents != null) parts.push(`${r.includedAgents} usuários`)
  if (r.includedWhatsAppChannels != null) parts.push(`${r.includedWhatsAppChannels} canais`)
  if (r.includedSessions != null) parts.push(`${r.includedSessions} sessões`)
  return parts.join(" · ") || "—"
}

export default async function HelenaAccountsPage() {
  const [accounts, clinics] = await Promise.all([listHelenaAccounts(), listClinics()])
  const clinicNameById = new Map(clinics.map((c) => [c.id, c.name]))

  const linked = accounts.filter((a) => a.clinic_id)
  const production = accounts.filter((a) => a.setup_status === "PRODUCTION" && a.active)
  const withWebhooks = accounts.filter((a) => (a.webhooks?.length ?? 0) > 0)
  const lastSync = accounts.reduce<string | null>(
    (max, a) => (max === null || a.synced_at > max ? a.synced_at : max),
    null,
  )

  return (
    <main className="p-6 space-y-6 max-w-screen-2xl mx-auto">
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Conta</th>
                    <th className="py-2 pr-3 font-semibold">Clínica vinculada</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Plano</th>
                    <th className="py-2 pr-3 font-semibold text-center">Tokens</th>
                    <th className="py-2 pr-3 font-semibold">Webhooks</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.company_id} className="border-b border-border/30 align-top hover:bg-accent/30 transition-colors">
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-foreground max-w-[220px] truncate" title={a.name ?? undefined}>
                          {a.name ?? "—"}
                        </div>
                        <div className="text-muted-foreground/70 max-w-[220px] truncate">
                          {a.legal_name ?? a.email ?? a.document_id ?? ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        {a.clinic_id ? (
                          <Link
                            href={`/clinicas/${a.clinic_id}`}
                            className="text-brand-gradient font-medium hover:opacity-85 transition-opacity"
                          >
                            {clinicNameById.get(a.clinic_id) ?? "Clínica"}
                          </Link>
                        ) : (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-400">
                            Não vinculada
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {setupBadge(a)}
                          {!a.active && (
                            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-red-400">
                              Inativa
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {resourcesLabel(a)}
                      </td>
                      <td
                        className="py-2 pr-3 text-center tabular-nums text-muted-foreground"
                        title={(a.tokens_meta ?? [])
                          .map((t) => t.name ?? "(sem nome)")
                          .join(", ") || undefined}
                      >
                        {a.tokens_meta?.length ?? 0}
                      </td>
                      <td className="py-2 pr-3">
                        {(a.webhooks?.length ?? 0) > 0 ? (
                          <ul className="space-y-0.5">
                            {a.webhooks!.map((w) => (
                              <li key={w.id} className="flex items-center gap-1.5">
                                <span
                                  className={`size-1.5 rounded-full shrink-0 ${w.enabled ? "bg-emerald-500" : "bg-zinc-500"}`}
                                />
                                <span
                                  className="text-muted-foreground max-w-[280px] truncate"
                                  title={`${w.url} · ${w.events.join(", ")}`}
                                >
                                  {w.name || w.url.replace(/^https?:\/\//, "")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : a.webhooks_error ? (
                          <span className="text-muted-foreground/60" title={a.webhooks_error}>
                            sem leitura
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">nenhum</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </main>
  )
}
