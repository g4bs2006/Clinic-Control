// Padrões — duas leituras do mesmo conjunto de saídas.
//
// "Registrado" é o que o gestor marcou numa lista fechada de 7 opções; "Apurado
// na conversa" é o que a IA extraiu do grupo, em texto livre. Ver os dois lado
// a lado é o ponto: quando eles divergem, é a lista fechada que está perdendo
// informação — foi o que aconteceu com a Volte a Sorrir ("Outro" no formulário,
// "ficou sem CRC e não conseguia operar" na conversa).
//
// Server-compatible — sem hooks.
import type { ChurnRow, ChurnAnalysis } from "@/lib/churns/actions"

interface ChurnPatternsProps {
  churns: ChurnRow[]
  analyses: Record<string, ChurnAnalysis>
}

/** Contagem por chave, da maior para a menor. */
function rank(values: string[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function Bars({ rows, tone }: { rows: [string, number][]; tone: "loss" | "ai" }) {
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(([label, count]) => (
        <li key={label}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-foreground" title={label}>
              {label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">{count}</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(count / max) * 100}%`,
                background: tone === "loss" ? "oklch(0.7 0.19 22)" : "oklch(0.76 0.13 195)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ChurnPatterns({ churns, analyses }: ChurnPatternsProps) {
  const registered = rank(churns.map((c) => c.reason ?? "Sem motivo"))

  // Um voto por churn: só o motivo mais forte de cada análise, senão uma
  // clínica com 3 motivos pesaria o triplo de outra com 1.
  const apurados = churns
    .map((c) => analyses[c.id])
    .filter((a) => a?.status === "concluido")
    .map((a) => a.reasons?.[0]?.motivo?.trim())
    .filter((m): m is string => !!m)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Registrado no formulário
        </p>
        {registered.length ? (
          <Bars rows={registered} tone="loss" />
        ) : (
          <p className="text-xs text-muted-foreground">Sem registros ainda.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Apurado na conversa
        </p>
        {apurados.length ? (
          <Bars rows={rank(apurados)} tone="ai" />
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhuma saída analisada ainda. Use <strong>Analisar conversa</strong> em uma entrada.
          </p>
        )}
      </div>
    </div>
  )
}
