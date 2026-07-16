// Skeleton da troca de aba — o header e as abas persistem via layout; aqui é
// só o conteúdo abaixo delas (mesmo padrão das abas da clínica).

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
      <PanelSkeleton tall />
      <PanelSkeleton />
    </>
  )
}
