import { listClinics } from "@/lib/clinics/actions"
import { listChurns, listChurnAnalyses } from "@/lib/churns/actions"
import { getCarteiraScope } from "@/lib/users/actions"
import { monthKey } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChurnRegisterDialog } from "@/components/churns/churn-register-dialog"
import { ChurnLedger } from "@/components/churns/churn-ledger"
import { ChurnPatterns } from "@/components/churns/churn-patterns"

export const dynamic = "force-dynamic"

/** Micro-barras do ritmo mensal — o eixo do tempo como atributo da contagem. */
function MonthRhythm({ counts }: { counts: [string, number][] }) {
  if (counts.length === 0) return null
  const max = Math.max(...counts.map(([, n]) => n))
  return (
    <div className="flex items-end gap-1.5" aria-hidden>
      {counts.map(([month, n]) => {
        const [, m] = month.split("-").map(Number)
        const label = new Date(Date.UTC(2000, m - 1, 1))
          .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
          .replace(".", "")
        return (
          <div key={month} className="flex flex-col items-center gap-1">
            <div
              className="w-3 rounded-sm bg-[oklch(0.7_0.19_22)]"
              style={{ height: `${Math.max(3, (n / max) * 20)}px` }}
            />
            <span className="text-[0.6rem] capitalize text-muted-foreground">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default async function ChurnsPage() {
  const [allClinics, allChurns, analyses, scope] = await Promise.all([
    listClinics(),
    listChurns(),
    listChurnAnalyses(),
    getCarteiraScope(),
  ])

  // Escopo por carteira: desenvolvedor vê só as suas clínicas; gestor vê todas.
  const clinics = scope.developerFilter
    ? allClinics.filter((c) => c.developer_id === scope.developerFilter)
    : allClinics
  // O recorte dos churns usa o developer_id que vem NO REGISTRO, não a lista de
  // clínicas ativas: listClinics() exclui arquivadas e toda clínica desligada é
  // arquivada, então cruzar com ela escondia 100% dos churns quando havia
  // carteira selecionada.
  const churns = scope.developerFilter
    ? allChurns.filter((c) => c.clinic_developer_id === scope.developerFilter)
    : allChurns

  const currentMonth = monthKey(new Date())
  const currentYear = currentMonth.slice(0, 4)

  const activeClinics = clinics.filter((c) => c.contract_status !== "archived")
  const churnsThisYear = churns.filter((c) => c.churn_month.startsWith(currentYear))

  // Churn rate do ano: desligamentos do ano ÷ (ativas + desligadas no ano)
  const churnRate =
    activeClinics.length + churnsThisYear.length > 0
      ? churnsThisYear.length / (activeClinics.length + churnsThisYear.length)
      : 0

  // Ritmo: contagem por mês em ordem cronológica (a lista vem desc).
  const byMonth = new Map<string, number>()
  for (const c of churns) byMonth.set(c.churn_month, (byMonth.get(c.churn_month) ?? 0) + 1)
  const rhythm = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6)

  const analyzed = churns.filter((c) => analyses[c.id]?.status === "concluido").length

  // Largura cheia, como /clinicas e /mensal. O comprimento de linha é limitado
  // dentro dos componentes: soltar o container não pode virar texto esticado a
  // 1600px, que é ilegível.
  return (
    <main className="space-y-6 p-4 sm:p-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="brand-header text-2xl font-bold">Churns</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Desligamentos da carteira · o que foi dito antes de sair
          </p>
        </div>
        <ChurnRegisterDialog
          clinics={activeClinics.map((c) => ({ id: c.id, name: c.name }))}
          currentMonth={currentMonth}
        />
      </div>

      {/* ── Indicadores ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel className="min-w-0">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
              Saídas em {currentYear}
            </span>
            <span className="text-4xl font-semibold leading-none tabular-nums text-foreground">
              {churnsThisYear.length.toLocaleString("pt-BR")}
            </span>
            {rhythm.length > 1 ? (
              <MonthRhythm counts={rhythm} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {churns.length} no total registrado
              </span>
            )}
          </div>
        </Panel>

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
          label="Post-mortem"
          value={`${analyzed} de ${churns.length}`}
          accent={analyzed === churns.length && churns.length > 0 ? "rose" : undefined}
          hint="saídas com a conversa analisada"
        />
      </div>

      {/* ── Registro + padrões ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(240px,300px)] 2xl:grid-cols-[1fr_360px]">
        <Panel title="Registro de saídas" subtitle="do mais recente para o mais antigo">
          <ChurnLedger churns={churns} analyses={analyses} />
        </Panel>

        <Panel title="Padrões" subtitle="o formulário contra a conversa">
          <ChurnPatterns churns={churns} analyses={analyses} />
        </Panel>
      </div>
    </main>
  )
}
