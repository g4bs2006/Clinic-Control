// Skeleton do Mapa — filtros, KPIs e a área do mapa + painéis laterais.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-3 w-56 opacity-60" />
        </div>
        <div className="flex gap-2">
          <Bar className="h-8 w-36" />
          <Bar className="h-8 w-32 opacity-70" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Bar className="mb-3 h-2.5 w-16 opacity-60" />
            <Bar className="h-8 w-24" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(260px,320px)]">
        <div className="rounded-lg border border-border bg-card p-5">
          <Bar className="mb-4 h-3 w-40" />
          <Bar className="h-[420px] w-full opacity-50" />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Bar className="mb-4 h-3 w-36" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bar key={i} className="h-8 w-full opacity-60" />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
