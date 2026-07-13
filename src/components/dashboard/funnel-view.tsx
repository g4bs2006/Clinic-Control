import { cn } from "@/lib/utils"

interface FunnelStep {
  title: string
  count: number
}

/** Totais do funil (mapping-aware) — vêm de buildLiveFunnel, então respeitam o
 *  mapeamento de colunas da clínica com fallback canônico. */
interface FunnelTotals {
  leads: number
  scheduled: number
  attended: number
  closed: number
  noShow: number
  notScheduled: number
  scheduledByCrc?: number
  scheduledByIa?: number
  scheduledUnclassified?: number
}

interface FunnelViewProps {
  steps: FunnelStep[]
  totals: FunnelTotals
}

const fmt = (n: number) => n.toLocaleString("pt-BR")
const pct = (n: number, d: number) =>
  d > 0 ? ((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "0%"

/**
 * Funil centrado: a LARGURA da barra codifica a quantidade (relativa a Leads),
 * formando a silhueta clássica de funil. Um único tom (roxo da marca) que
 * escurece rumo ao fechamento — régua sequencial, sem arco-íris. A conversão
 * entre etapas e os vazamentos (não agendou / no-show) vivem nos conectores.
 * Server-compatible — sem hooks.
 */
export function FunnelView({ steps, totals }: FunnelViewProps) {
  const top = Math.max(1, totals.leads)

  const levels: {
    name: string
    count: number
    prev: number | null
    verb?: string
    leak?: { text: string; cls: string } | null
    barCls: string
  }[] = [
    { name: "Leads", count: totals.leads, prev: null, barCls: "bg-primary/40" },
    {
      name: "Agendaram",
      count: totals.scheduled,
      prev: totals.leads,
      verb: "agendaram",
      leak:
        totals.notScheduled > 0
          ? { text: `${fmt(totals.notScheduled)} não agendaram`, cls: "text-amber-400" }
          : null,
      barCls: "bg-primary/60",
    },
    {
      name: "Compareceram",
      count: totals.attended,
      prev: totals.scheduled,
      verb: "compareceram",
      leak:
        totals.noShow > 0
          ? { text: `${fmt(totals.noShow)} no-show`, cls: "text-rose-400" }
          : null,
      barCls: "bg-primary/80",
    },
    {
      name: "Fecharam",
      count: totals.closed,
      prev: totals.attended,
      verb: "fecharam",
      barCls: "bg-primary",
    },
  ]

  // Detalhamento: todas as colunas reais do painel com card no mês.
  const outcomes = steps.filter((s) => s.count > 0)

  // Só mostra o breakdown por responsável se a clínica já tem etiqueta
  // configurada (CRC ou IA) — evita ruído para quem não configurou ainda.
  const crc = totals.scheduledByCrc ?? 0
  const ia = totals.scheduledByIa ?? 0
  const unclassified = totals.scheduledUnclassified ?? 0
  const showScheduler = crc > 0 || ia > 0
  const schedulerTotal = crc + ia + unclassified
  const schedulerChips = [
    { label: "CRC", count: crc, cls: "bg-sky-500/15 text-sky-400" },
    { label: "IA", count: ia, cls: "bg-violet-500/15 text-violet-400" },
    { label: "Não classificado", count: unclassified, cls: "bg-muted text-muted-foreground" },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* ── Funil centrado ── */}
      <div className="flex flex-col">
        {levels.map((lvl) => {
          // Largura proporcional a Leads; piso visual para a etapa não sumir.
          const width = lvl.count > 0 ? Math.max((lvl.count / top) * 100, 8) : 0

          return (
            <div key={lvl.name}>
              {/* Conector: conversão da etapa + vazamento */}
              {lvl.prev !== null && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 py-1.5 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span aria-hidden className="text-[0.6rem]">▼</span>
                    <strong className="tabular-nums text-foreground/90">{pct(lvl.count, lvl.prev)}</strong>
                    {lvl.verb}
                  </span>
                  {lvl.leak && (
                    <span className={cn("text-[0.7rem]", lvl.leak.cls)}>
                      · {lvl.leak.text}
                    </span>
                  )}
                </div>
              )}

              {/* Barra centrada com rótulo sobreposto */}
              <div
                className="relative flex h-10 items-center justify-center"
                title={`${lvl.name}: ${fmt(lvl.count)}${lvl.prev !== null ? ` (${pct(lvl.count, lvl.prev)} da etapa anterior)` : ""}`}
              >
                {width > 0 && (
                  <div
                    className={cn("h-full rounded-md transition-all duration-500", lvl.barCls)}
                    style={{ width: `${width}%` }}
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm">
                  <span className="font-medium text-foreground/90">{lvl.name}</span>
                  <span className="font-bold tabular-nums text-foreground">{fmt(lvl.count)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Detalhamento por coluna do painel ── */}
      {outcomes.length > 0 && (
        <div className="border-t border-border/40 pt-4">
          <h4 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Detalhamento por coluna do painel
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {outcomes.map((o) => (
              <div
                key={o.title}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-accent/20 px-3 py-2 hover:bg-accent/40 transition-colors"
              >
                <span className="truncate text-xs text-muted-foreground" title={o.title}>
                  {o.title}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                  {fmt(o.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agendado por quem: CRC vs IA (via etiqueta do card) ── */}
      {showScheduler && (
        <div className="border-t border-border/40 pt-4">
          <h4 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Agendado por quem
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {schedulerChips.map((c) => (
              <div key={c.label} className={cn("flex flex-col items-center gap-1 rounded-lg px-3 py-2", c.cls)}>
                <span className="text-lg font-bold tabular-nums">{fmt(c.count)}</span>
                <span className="text-[0.7rem] text-center">{c.label}</span>
                <span className="text-[0.65rem] opacity-70">{pct(c.count, schedulerTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
