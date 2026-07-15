// Skeleton da troca de aba — o header e as abas persistem via layout; aqui é
// só o conteúdo abaixo delas.

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
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <Bar className="h-3 w-20 opacity-60" />
            <Bar className="h-7 w-24" />
          </div>
        ))}
      </div>
      <PanelSkeleton tall />
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <PanelSkeleton />
    </>
  )
}
