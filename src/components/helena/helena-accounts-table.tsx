"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { HelenaLinkDialog } from "@/components/helena/helena-link-dialog"
import { unlinkHelenaAccountFromClinic } from "@/lib/helena/link-actions"
import type { HelenaAccountRow } from "@/lib/helena/accounts-actions"
import type { UserProfile } from "@/lib/users/actions"

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

// Remove acentos comparando o code point de cada caractere após NFD (0x300-0x36f).
function stripAccents(s: string): string {
  return Array.from(s.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < 0x300 || code > 0x36f
    })
    .join("")
}

function normalize(s: string): string {
  return stripAccents(s.toLowerCase())
}

/** Célula "clínica vinculada": link para a clínica + ação de desvincular. */
function LinkedClinicCell({
  clinicId,
  clinicName,
  accountName,
}: {
  clinicId: string
  clinicName: string
  accountName: string
}) {
  const [pending, startTransition] = useTransition()
  const confirm = useConfirm()
  const router = useRouter()

  async function handleUnlink() {
    const ok = await confirm({
      title: "Desvincular conta Helena?",
      description:
        `A conta "${accountName}" deixará de ficar vinculada a "${clinicName}". ` +
        "O token de integração, o painel e o mapeamento do funil serão apagados — " +
        "revincular depois exige refazer o mapeamento. Os dados já sincronizados são mantidos.",
      confirmLabel: "Desvincular",
      cancelLabel: "Cancelar",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await unlinkHelenaAccountFromClinic(clinicId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Conta desvinculada da clínica")
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/clinicas/${clinicId}`}
        className="text-brand-gradient font-medium hover:opacity-85 transition-opacity"
      >
        {clinicName}
      </Link>
      <button
        type="button"
        onClick={handleUnlink}
        disabled={pending}
        className="rounded-full bg-red-500/10 px-2 py-0.5 text-[0.62rem] font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {pending ? "…" : "Desvincular"}
      </button>
    </div>
  )
}

interface HelenaAccountsTableProps {
  accounts: HelenaAccountRow[]
  clinicNameById: Map<string, string>
  unintegratedClinics: { id: string; name: string }[]
  profile: UserProfile | null
  developerOptions: { id: string; name: string }[]
}

export function HelenaAccountsTable({
  accounts,
  clinicNameById,
  unintegratedClinics,
  profile,
  developerOptions,
}: HelenaAccountsTableProps) {
  const [query, setQuery] = useState("")
  const [onlyUnlinked, setOnlyUnlinked] = useState(false)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const qDigits = query.replace(/[^0-9]/g, "")
    return accounts.filter((a) => {
      if (onlyUnlinked && a.clinic_id) return false
      if (!q) return true
      const haystack = normalize([a.name, a.legal_name, a.email].filter(Boolean).join(" "))
      const matchesText = haystack.includes(q)
      const matchesDocument = qDigits.length >= 3 && (a.document_id ?? "").includes(qDigits)
      return matchesText || matchesDocument
    })
  }, [accounts, query, onlyUnlinked])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, razão social, e-mail ou CNPJ…"
          className="sm:max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <Checkbox checked={onlyUnlinked} onCheckedChange={(c) => setOnlyUnlinked(c === true)} />
          Só não vinculadas
        </label>
      </div>

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
            {filtered.map((a) => (
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
                    <LinkedClinicCell
                      clinicId={a.clinic_id}
                      clinicName={clinicNameById.get(a.clinic_id) ?? "Clínica"}
                      accountName={a.name ?? "Conta sem nome"}
                    />
                  ) : (
                    <HelenaLinkDialog
                      account={a}
                      unintegratedClinics={unintegratedClinics}
                      profile={profile}
                      developerOptions={developerOptions}
                    />
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
                            {w.name || w.url.split("://").pop()}
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
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma conta encontrada com esse filtro.
          </p>
        )}
      </div>
    </div>
  )
}
