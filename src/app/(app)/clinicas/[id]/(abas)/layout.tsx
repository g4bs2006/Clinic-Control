// Layout das abas da clínica: header leve (nome, localização, badges que não
// dependem de chamadas externas) + navegação por abas. Cada aba é uma sub-rota
// e busca só os próprios dados — o header persiste na troca. Badges dinâmicos
// (canais online, status da taxa) vivem na aba Visão geral: dependem da Helena
// e travariam o shell de todas as abas.
import Link from "next/link"
import { notFound } from "next/navigation"
import { getClinic, listClinicsInScope } from "@/lib/clinics/actions"
import { ClinicPlanBadge } from "@/components/clinics/clinic-plan-badge"
import { ClinicTabs } from "@/components/clinics/clinic-tabs"

export const dynamic = "force-dynamic"

const CONTRACT_LABEL: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
}

export default async function ClinicTabsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Anterior/Próxima navegam DENTRO da carteira ativa (mesmo recorte da busca
  // global). Clínica aberta fora do escopo (link direto): página abre normal,
  // só fica sem a navegação sequencial.
  const [clinic, scopedClinics] = await Promise.all([getClinic(id), listClinicsInScope()])
  if (!clinic) notFound()

  const currentIndex = scopedClinics.findIndex((c) => c.id === id)
  const prevClinic = currentIndex > 0 ? scopedClinics[currentIndex - 1] : null
  const nextClinic =
    currentIndex !== -1 && currentIndex < scopedClinics.length - 1
      ? scopedClinics[currentIndex + 1]
      : null
  const cityUf = [clinic.city, clinic.state].filter(Boolean).join("/")
  const isAuto = clinic.mode === "auto"

  return (
    <main className="p-4 space-y-6 sm:p-6 max-w-screen-2xl mx-auto">
      {/* ── Header (persiste entre as abas) ────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            ← Carteira
          </Link>
          <div className="flex items-center gap-2">
            {prevClinic && (
              <Link
                href={`/clinicas/${prevClinic.id}`}
                title={prevClinic.name}
                className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                ← Anterior
              </Link>
            )}
            {nextClinic && (
              <Link
                href={`/clinicas/${nextClinic.id}`}
                title={nextClinic.name}
                className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold brand-header">{clinic.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cityUf || "Sem localização"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {isAuto ? "Automática" : "Manual"}
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {CONTRACT_LABEL[clinic.contract_status] ?? clinic.contract_status}
            </span>
            <ClinicPlanBadge clinicId={id} current={clinic.plan ?? null} />
          </div>
        </div>
      </div>

      <ClinicTabs clinicId={id} />

      {children}
    </main>
  )
}
