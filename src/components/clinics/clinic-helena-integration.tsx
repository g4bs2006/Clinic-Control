import Link from "next/link"
import { Panel } from "@/components/dashboard/panel"
import type { HelenaAccountRow, HelenaEventCatalogItem } from "@/lib/helena/accounts-actions"

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

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function ClinicHelenaIntegration({
  account,
  events,
}: {
  account: HelenaAccountRow
  events: HelenaEventCatalogItem[]
}) {
  const setup = SETUP_LABEL[account.setup_status ?? ""] ?? {
    label: account.setup_status ?? "—",
    cls: "bg-zinc-500/15 text-zinc-400",
  }
  const resources = account.config?.resources
  const subscribedEvents = new Set(
    (account.webhooks ?? []).filter((w) => w.enabled).flatMap((w) => w.events),
  )

  return (
    <Panel
      title="Integração Helena"
      subtitle={`conta, tokens e webhooks · sincronizado em ${new Date(account.synced_at).toLocaleString("pt-BR")}`}
    >
      {/* Conta */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/60 bg-accent/20 p-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {account.name ?? "Conta Helena"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${setup.cls}`}>
              {setup.label}
            </span>
            {!account.active && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-red-400">
                Inativa
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {[account.legal_name, account.document_id, account.email, account.phone]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          <div className="text-[0.68rem] text-muted-foreground">
            ID da conta:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] select-all">
              {account.company_id}
            </code>
          </div>
        </div>
        <div className="text-right text-[0.68rem] text-muted-foreground space-y-0.5 shrink-0">
          {resources && (
            <>
              <div>{resources.includedAgents ?? "—"} usuários · {resources.includedWhatsAppChannels ?? "—"} canais WhatsApp</div>
              <div>{resources.includedSessions ?? "—"} sessões · {resources.includedPanels ?? "—"} painéis</div>
            </>
          )}
          <div>
            na Helena desde {fmtDate(account.helena_created_at)} ·{" "}
            <Link href="/helena" className="text-brand-gradient hover:opacity-85 transition-opacity">
              todas as contas
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Tokens */}
        <div className="rounded-md border border-border/60 bg-accent/20 p-3 space-y-2">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Tokens de integração ({account.tokens_meta?.length ?? 0})
          </div>
          {(account.tokens_meta?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum token na conta.</p>
          ) : (
            <ul className="space-y-1">
              {account.tokens_meta!.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-foreground truncate">{t.name || "(sem nome)"}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    criado em {fmtDate(t.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border/40 pt-2 text-[0.65rem] leading-relaxed text-muted-foreground/70">
            Por segurança, os valores dos tokens não são exibidos — o token usado pelo
            Clinic Control fica cifrado no servidor.
          </p>
        </div>

        {/* Webhooks */}
        <div className="rounded-md border border-border/60 bg-accent/20 p-3 space-y-2">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Webhooks assinados ({account.webhooks?.length ?? 0})
          </div>
          {(account.webhooks?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">
              {account.webhooks_error
                ? `Não foi possível ler (${account.webhooks_error})`
                : "Nenhuma assinatura de webhook nesta conta."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {account.webhooks!.map((w) => (
                <li key={w.id} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${w.enabled ? "bg-emerald-500" : "bg-zinc-500"}`}
                      title={w.enabled ? "Ativo" : "Desativado"}
                    />
                    <span className="font-medium text-foreground truncate">
                      {w.name || "(sem nome)"}
                    </span>
                    <span className="text-muted-foreground/70 shrink-0">
                      {w.events.join(", ")}
                    </span>
                  </div>
                  <div className="pl-3 text-[0.68rem] text-muted-foreground truncate" title={w.url}>
                    {w.url}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Eventos assináveis */}
      {events.length > 0 && (
        <div className="space-y-2">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Eventos disponíveis para assinatura
            <span className="ml-1.5 normal-case font-normal text-muted-foreground/70">
              (verde = coberto por webhook ativo)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {events.map((e) => {
              const covered = subscribedEvents.has(e.event)
              return (
                <span
                  key={e.event}
                  title={e.event}
                  className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${
                    covered
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {e.description ?? e.event}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}
