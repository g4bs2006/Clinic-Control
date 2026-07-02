"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { archiveClinic } from "@/lib/clinics/actions"
import type { Clinic } from "@/lib/clinics/schema"
import type { CheckItemRow } from "@/lib/clinics/check-items-actions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

const modeLabels: Record<Clinic["mode"], string> = {
  auto: "Automático",
  manual: "Manual",
}

const modeColors: Record<Clinic["mode"], string> = {
  auto: "bg-brand-solid/15 text-brand-text border border-brand-solid/25",
  manual: "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30",
}

const statusLabels: Record<Clinic["contract_status"], string> = {
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
}

const statusColors: Record<Clinic["contract_status"], string> = {
  active: "bg-green-500/20 text-green-300 border border-green-500/30",
  suspended: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  archived: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
}

interface ClinicTableProps {
  clinics: Clinic[]
  checkItems: CheckItemRow[]
  /** Map<clinicId, Map<checkItemId, checked>> */
  allChecks: Record<string, Record<string, boolean>>
}

export function ClinicTable({ clinics, checkItems, allChecks }: ClinicTableProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<"all" | "completed" | "pending">("all")
  const [query, setQuery] = useState("")

  if (clinics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-lg font-medium text-foreground">Nenhuma clínica cadastrada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Clique em &ldquo;Nova clínica&rdquo; para adicionar a primeira.
        </p>
      </div>
    )
  }

  const hasCheckItems = checkItems.length > 0

  // Calculate checklists for counts
  const completedClinicsCount = clinics.filter((c) => {
    if (!hasCheckItems) return false
    const checks = allChecks[c.id] ?? {}
    const checkedCount = checkItems.filter((ci) => checks[ci.id] === true).length
    return checkedCount === checkItems.length
  }).length

  const pendingClinicsCount = clinics.filter((c) => {
    if (!hasCheckItems) return true
    const checks = allChecks[c.id] ?? {}
    const checkedCount = checkItems.filter((ci) => checks[ci.id] === true).length
    return checkedCount < checkItems.length
  }).length

  // Filter rows by status and search query
  const filteredClinics = clinics.filter((c) => {
    // 1. Status Filter
    if (filter !== "all" && hasCheckItems) {
      const checks = allChecks[c.id] ?? {}
      const checkedCount = checkItems.filter((ci) => checks[ci.id] === true).length
      const isCompleted = checkedCount === checkItems.length

      if (filter === "completed" && !isCompleted) return false
      if (filter === "pending" && isCompleted) return false
    }

    // 2. Search Query Filter
    if (query.trim()) {
      const term = query.toLowerCase()
      const match =
        c.name.toLowerCase().includes(term) ||
        (c.city && c.city.toLowerCase().includes(term)) ||
        (c.state && c.state.toLowerCase().includes(term)) ||
        (c.region && c.region.toLowerCase().includes(term)) ||
        (c.system && c.system.toLowerCase().includes(term))
      if (!match) return false
    }

    return true
  })

  function handleArchive(id: string, name: string) {
    if (confirm(`Deseja realmente arquivar a clínica "${name}"?`)) {
      startTransition(async () => {
        const res = await archiveClinic(id)
        if (res.ok) {
          toast.success(`Clínica "${name}" arquivada com sucesso.`)
          router.refresh()
        } else {
          toast.error(res.error)
        }
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Filters & Search Row ───────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3">
        {hasCheckItems ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                filter === "all"
                  ? "bg-brand text-white shadow"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              Todas ({clinics.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("completed")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                filter === "completed"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              Prontas ({completedClinicsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                filter === "pending"
                  ? "bg-amber-600 text-white shadow"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              Com Pendências ({pendingClinicsCount})
            </button>
          </div>
        ) : (
          <div /> // spacing placeholder
        )}

        {/* Input de busca local */}
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clínica..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      {filteredClinics.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma clínica encontrada para este filtro</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Região</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Status do contrato</TableHead>
              {hasCheckItems && <TableHead>Checklist</TableHead>}
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClinics.map((clinic) => {
              const clinicChecks = allChecks[clinic.id] ?? {}
              const checkedCount = checkItems.filter(
                (ci) => clinicChecks[ci.id] === true,
              ).length

              return (
                <TableRow key={clinic.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/clinicas/${clinic.id}`}
                      className="text-primary hover:underline"
                    >
                      {clinic.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {clinic.city && clinic.state
                      ? `${clinic.city}/${clinic.state}`
                      : clinic.city ?? clinic.state ?? "—"}
                  </TableCell>
                  <TableCell>{clinic.region ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${modeColors[clinic.mode]}`}
                    >
                      {modeLabels[clinic.mode]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[clinic.contract_status]}`}
                    >
                      {statusLabels[clinic.contract_status]}
                    </span>
                  </TableCell>
                  {hasCheckItems && (
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5">
                          {checkItems.map((ci) => {
                            const isChecked = clinicChecks[ci.id] === true
                            return (
                              <span
                                key={ci.id}
                                title={`${ci.label}: ${isChecked ? "Sim" : "Não"}`}
                                className={`inline-flex size-4 items-center justify-center rounded text-[0.55rem] font-bold ${
                                  isChecked
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-zinc-500/15 text-zinc-600"
                                }`}
                              >
                                {isChecked ? "✓" : "○"}
                              </span>
                            )
                          })}
                        </div>
                        <span className="text-[0.65rem] tabular-nums text-muted-foreground">
                          {checkedCount}/{checkItems.length}
                        </span>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/clinicas/${clinic.id}`}
                        className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                      >
                        Ver
                      </Link>
                      <Link
                        href={`/clinicas/${clinic.id}/editar`}
                        className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                      >
                        Editar
                      </Link>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleArchive(clinic.id, clinic.name)}
                      >
                        Arquivar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}


