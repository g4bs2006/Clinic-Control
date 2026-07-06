import { listClinics } from "@/lib/clinics/actions"
import { listChurns } from "@/lib/churns/actions"
import { getCarteiraScope } from "@/lib/users/actions"
import { monthKey } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChurnForm } from "@/components/churns/churn-form"
import { ChurnTable } from "@/components/churns/churn-table"

export const dynamic = "force-dynamic"

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function ChurnsPage() {
  const [allClinics, allChurns, scope] = await Promise.all([
    listClinics(),
    listChurns(),
    getCarteiraScope(),
  ])

  // Escopo por carteira: desenvolvedor vê só as suas clínicas; gestor vê todas.
  const clinics = scope.developerFilter
    ? allClinics.filter((c) => c.developer_id === scope.developerFilter)
    : allClinics
  const scopedIds = new Set(clinics.map((c) => c.id))
  const churns = scope.developerFilter
    ? allChurns.filter((c) => scopedIds.has(c.clinic_id))
    : allChurns

  const currentMonth = monthKey(new Date())
  const currentYear = currentMonth.slice(0, 4)

  const activeClinics = clinics.filter((c) => c.contract_status !== "archived")
  const churnsThisYear = churns.filter((c) => c.churn_month.startsWith(currentYear))
  const lostRevenueTotal = churns.reduce((sum, c) => sum + (c.lost_revenue ?? 0), 0)

  // Churn rate do ano: desligamentos do ano ÷ (ativas + desligadas no ano)
  const churnRate =
    activeClinics.length + churnsThisYear.length > 0
      ? churnsThisYear.length / (activeClinics.length + churnsThisYear.length)
      : 0

  // Motivos mais comuns
  const reasonCounts = new Map<string, number>()
  for (const c of churns) {
    const key = c.reason ?? "Sem motivo"
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
  }
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])
  const maxReasonCount = Math.max(1, ...topReasons.map(([, n]) => n))

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold brand-header">Churns</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Desligamentos da carteira · registro, motivos e impacto
        </p>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Desligamentos"
          value={churns.length.toLocaleString("pt-BR")}
          hint="total registrado"
        />
        <KpiCard
          label={`Em ${currentYear}`}
          value={churnsThisYear.length.toLocaleString("pt-BR")}
          accent="rose"
        />
        <KpiCard
          label="Churn rate"
          value={
            (churnRate * 100).toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }) + "%"
          }
          accent="purple"
          hint={`desligadas ÷ carteira de ${currentYear}`}
        />
        <KpiCard
          label="Receita perdida"
          value={fmtBRL(lostRevenueTotal)}
          accent="teal"
          hint="soma das mensalidades"
        />
      </div>

      {/* ── Registrar ──────────────────────────────────────────── */}
      <Panel
        title="Registrar desligamento"
        subtitle="a clínica é arquivada e sai da carteira ativa"
      >
        <ChurnForm
          clinics={activeClinics.map((c) => ({ id: c.id, name: c.name }))}
          currentMonth={currentMonth}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(260px,320px)]">
        {/* ── Lista ──────────────────────────────────────────────── */}
        <Panel title="Histórico de desligamentos" subtitle="mais recentes primeiro">
          <ChurnTable churns={churns} />
        </Panel>

        {/* ── Motivos ────────────────────────────────────────────── */}
        <Panel title="Motivos" subtitle="frequência entre os desligamentos">
          {topReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registros ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topReasons.map(([reason, count]) => (
                <li key={reason}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground truncate">{reason}</span>
                    <span className="font-semibold tabular-nums text-muted-foreground shrink-0">
                      {count}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-red-400/70"
                      style={{ width: `${(count / maxReasonCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  )
}
