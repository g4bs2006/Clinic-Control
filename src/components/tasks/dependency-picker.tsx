"use client"

// Dependências entre tarefas — "bloqueada por" (epic #33, sub-issue #36).
// Chips das bloqueadoras atuais (com remover) + popover de busca para
// adicionar novas. "Bloqueia" (visão inversa) é só leitura, pra dar contexto
// de quem espera esta tarefa terminar.

import { useState, useTransition } from "react"
import { Link2, Search, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { listTasks, type TaskRow } from "@/lib/tasks/actions"
import { addDependency, removeDependency, type DependencyTaskRow } from "@/lib/tasks/dependencies"
import { TASK_STATUS_LABEL } from "@/lib/tasks/categories"

const DONE = new Set(["concluida", "cancelada"])

export function DependencySection({
  taskId,
  blockers,
  blocking,
  onChanged,
}: {
  taskId: string
  blockers: DependencyTaskRow[]
  blocking: DependencyTaskRow[]
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<TaskRow[] | null>(null)

  function loadCandidates() {
    if (candidates) return
    startTransition(async () => {
      setCandidates(await listTasks())
    })
  }

  const excluded = new Set([taskId, ...blockers.map((b) => b.id)])
  const filtered = (candidates ?? [])
    .filter((t) => !excluded.has(t.id))
    .filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 30)

  function add(id: string) {
    startTransition(async () => {
      const res = await addDependency(taskId, id)
      if (res.ok) {
        setOpen(false)
        setQuery("")
        onChanged()
      } else {
        toast.error(res.error)
      }
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeDependency(taskId, id)
      if (res.ok) onChanged()
      else toast.error(res.error)
    })
  }

  const hasOpenBlocker = blockers.some((b) => !DONE.has(b.status))

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Link2 className="size-3.5" />
          Bloqueada por {blockers.length > 0 && `(${blockers.length})`}
        </p>
        <Popover
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (v) loadCandidates()
          }}
        >
          <PopoverTrigger render={<Button type="button" size="sm" variant="outline">Adicionar</Button>} />
          <PopoverContent align="end" className="w-72 p-2">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tarefa…"
                className="h-8 pl-8"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {!candidates ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Carregando…</p>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma tarefa encontrada.</p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={pending}
                    onClick={() => add(t.id)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent/40"
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                      {TASK_STATUS_LABEL[t.status]}
                    </span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {blockers.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma dependência — livre para avançar.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {blockers.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md bg-accent/20 px-2 py-1.5 text-sm"
            >
              <span
                className={`truncate ${DONE.has(b.status) ? "text-muted-foreground line-through" : "text-foreground"}`}
              >
                {b.title}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[0.65rem] text-muted-foreground">{TASK_STATUS_LABEL[b.status]}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(b.id)}
                  aria-label="Remover dependência"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {blocking.length > 0 && (
        <p className="text-[0.7rem] text-muted-foreground">
          Bloqueia: {blocking.map((b) => b.title).join(", ")}
        </p>
      )}
      {hasOpenBlocker && (
        <p className="text-[0.7rem] text-amber-500">
          Não é possível avançar o status enquanto houver dependência aberta.
        </p>
      )}
    </div>
  )
}
