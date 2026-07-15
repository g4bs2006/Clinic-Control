// Skeleton da página de UMA clínica — sem ele, a navegação caía no fallback
// da lista (formato tabela) e a troca de layout dava sensação de travamento.
// Espelha a estrutura real: header com navegação, KPIs, gráfico e painéis.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

function PanelSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <Bar className="h-4 w-44" />
      <Bar className="h-3 w-64 opacity-60" />
      <Bar className={tall ? "h-40 w-full opacity-50" : "h-16 w-full opacity-50"} />
    </div>
  )
}

export default function Loading() {
  return (
    <main className="p-4 space-y-6 sm:p-6 max-w-screen-2xl mx-auto">
      {/* Header: voltar + anterior/próxima */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Bar className="h-3 w-16" />
          <div className="flex gap-2">
            <Bar className="h-7 w-20" />
            <Bar className="h-7 w-20" />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Bar className="h-8 w-56" />
            <Bar className="h-3 w-40 opacity-60" />
          </div>
          <Bar className="h-8 w-28" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <Bar className="h-3 w-20 opacity-60" />
            <Bar className="h-7 w-24" />
          </div>
        ))}
      </div>

      {/* Gráfico principal + painéis */}
      <PanelSkeleton tall />
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <PanelSkeleton tall />
      <PanelSkeleton />
    </main>
  )
}
