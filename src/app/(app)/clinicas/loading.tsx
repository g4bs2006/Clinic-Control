// Skeleton da página de Clínicas — tabela com filtros e busca, para o fallback
// de navegação não pular do formato dashboard para o formato tabela.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export default function Loading() {
  return (
    <main className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-32" />
        <Bar className="h-9 w-32" />
      </div>

      {/* Barra de filtros + busca */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex gap-1.5">
          <Bar className="h-7 w-24" />
          <Bar className="h-7 w-24 opacity-60" />
          <Bar className="h-7 w-28 opacity-60" />
        </div>
        <Bar className="h-9 w-64" />
      </div>

      {/* Linhas da tabela */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border p-3">
          <Bar className="h-3 w-full opacity-60" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 px-4 py-3">
            <Bar className="h-4 w-40" />
            <Bar className="h-4 w-24 opacity-70" />
            <div className="flex-1" />
            <Bar className="h-5 w-16 opacity-60" />
            <Bar className="h-5 w-20 opacity-60" />
          </div>
        ))}
      </div>
    </main>
  )
}
