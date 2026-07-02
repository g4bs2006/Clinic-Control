"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { runProvisioning } from "@/lib/clinics/provision-actions"
import type { ProvisionRow } from "@/lib/clinics/provision-schema"

const STEP_LABEL: Record<string, string> = {
  account: "Conta na Helena",
  token: "Token de integração",
  owner_user: "Usuário do dono (Admin)",
  teams: "Equipes padrão",
  tags: "Etiquetas padrão",
  panel: "Painel do CRM",
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  done: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-400" },
  error: { label: "Erro", cls: "bg-red-500/15 text-red-400" },
  manual: { label: "Ação manual", cls: "bg-amber-500/15 text-amber-400" },
  pending: { label: "Pendente", cls: "bg-zinc-500/15 text-zinc-400" },
}

interface ClinicProvisioningProps {
  clinicId: string
  rows: ProvisionRow[]
}

export function ClinicProvisioning({ clinicId, rows }: ClinicProvisioningProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const hasIssues = rows.some((r) => r.status !== "done")

  function reprocess() {
    startTransition(async () => {
      const res = await runProvisioning(clinicId)
      if (res.ok) {
        const remaining = res.rows.filter((r) => r.status !== "done").length
        toast.success(
          remaining === 0
            ? "Provisionamento completo!"
            : `Reprocessado — ${remaining} etapa(s) ainda pendente(s).`,
        )
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending
          return (
            <li
              key={r.step}
              className="flex flex-col gap-1 rounded-md border border-border/60 bg-accent/20 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="w-56 shrink-0 text-sm font-medium text-foreground">
                {STEP_LABEL[r.step] ?? r.step}
              </span>
              <span
                className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${status.cls}`}
              >
                {status.label}
              </span>
              {r.detail && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={r.detail}>
                  {r.detail}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {hasIssues && (
        <div>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={reprocess}>
            {pending ? "Reprocessando…" : "Reprocessar provisionamento"}
          </Button>
        </div>
      )}
    </div>
  )
}
