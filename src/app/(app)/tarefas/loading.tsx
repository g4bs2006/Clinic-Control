// Skeleton da página de Tarefas — filtros + lista, para o fallback de navegação
// combinar com o formato real (não com o dashboard).

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-screen-xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <Bar className="h-7 w-28" />
        <Bar className="h-3 w-72 opacity-60" />
      </div>

      <div className="rounded-lg border border-border bg-card px-5 pb-5 pt-4">
        {/* Filtros + ações */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Bar className="h-8 w-36" />
          <Bar className="h-8 w-36 opacity-70" />
          <Bar className="h-8 w-36 opacity-70" />
          <div className="flex-1" />
          <Bar className="h-8 w-28" />
        </div>

        {/* Linhas de tarefa */}
        <div className="border-b border-border/40 pb-2">
          <Bar className="h-4 w-4" />
        </div>
        <div className="flex flex-col divide-y divide-border/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <Bar className="size-4 rounded-full" />
              <Bar className="size-2 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar className="h-4 w-1/2" />
                <Bar className="h-3 w-1/3 opacity-60" />
              </div>
              <Bar className="h-7 w-36 opacity-70" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
