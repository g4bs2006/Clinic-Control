// Skeleton do Gerenciador de grupos (WhatsApp) — filtros, KPIs e painéis/tabela.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bar className="h-7 w-56" />
          <Bar className="h-3 w-64 opacity-60" />
        </div>
        <Bar className="h-8 w-36" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Bar className="mb-3 h-2.5 w-20 opacity-60" />
            <Bar className="h-8 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card px-5 pb-5 pt-4">
        <Bar className="mb-4 h-3 w-48" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 py-2.5">
            <Bar className="h-4 w-44" />
            <div className="flex flex-1 justify-end gap-4">
              <Bar className="h-4 w-16 opacity-60" />
              <Bar className="h-4 w-16 opacity-60" />
              <Bar className="h-4 w-20 opacity-60" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
