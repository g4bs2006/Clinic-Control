// Skeleton da grade mensal — cabeçalho + tabela editável de métricas por clínica.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export default function Loading() {
  return (
    <main className="space-y-6 p-8">
      <div className="space-y-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-3 w-40 opacity-60" />
      </div>

      <div className="rounded-lg border border-border">
        <div className="border-b border-border p-3">
          <Bar className="h-3 w-full opacity-60" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 px-4 py-3">
            <Bar className="h-4 w-44" />
            <div className="flex flex-1 justify-end gap-4">
              <Bar className="h-6 w-16 opacity-70" />
              <Bar className="h-6 w-16 opacity-70" />
              <Bar className="h-6 w-16 opacity-70" />
              <Bar className="h-5 w-20 opacity-60" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
