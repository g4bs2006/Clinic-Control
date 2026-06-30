// Shown instantly during navigation between (app) routes while the server
// component fetches. Mirrors the dashboard's shape so the layout doesn't jump.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      <Bar className="mb-4 h-3 w-32" />
      <Bar className="h-[200px] w-full opacity-60" />
    </div>
  )
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bar className="h-6 w-40" />
          <Bar className="h-3 w-56 opacity-60" />
        </div>
        <Bar className="h-8 w-36" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Bar className="mb-3 h-2.5 w-16 opacity-60" />
            <Bar className="h-8 w-24" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </main>
  )
}
