"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus, Search } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { TaskFields, type ClinicOption, type ProfileOption } from "./task-fields"
import { createTasksForClinics } from "@/lib/tasks/actions"
import type { TaskCategory, TaskPriority } from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"

export function CreateTaskDialog({
  clinics,
  profiles,
  categories,
  defaultClinicId = null,
  currentUserId = null,
  onCreated,
}: {
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  defaultClinicId?: string | null
  currentUserId?: string | null
  onCreated: () => void
}) {
  const defaultCategory = categories[0]?.slug ?? "outro"
  const initialClinicIds = useMemo(() => (defaultClinicId ? [defaultClinicId] : []), [defaultClinicId])

  // Responsável sugerido = dev da clínica; fallback (sem clínica, ou clínica sem
  // dev) = quem está criando. Multi-clínica: se todas compartilham o mesmo dev
  // usa ele, senão cai no criador (o campo é único; cada tarefa nasce com esse
  // responsável, editável antes de salvar).
  const suggestAssignee = useCallback(
    (ids: string[]): string | null => {
      if (ids.length === 0) return currentUserId
      const devs = ids.map((id) => clinics.find((c) => c.id === id)?.developerId ?? null)
      if (ids.length === 1) return devs[0] ?? currentUserId
      const uniq = [...new Set(devs)]
      return uniq.length === 1 && uniq[0] ? uniq[0] : currentUserId
    },
    [clinics, currentUserId],
  )

  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [clinicIds, setClinicIds] = useState<string[]>(initialClinicIds)
  const [clinicQuery, setClinicQuery] = useState("")
  const [category, setCategory] = useState<TaskCategory>(defaultCategory)
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [assignedTo, setAssignedTo] = useState<string | null>(() => suggestAssignee(initialClinicIds))
  const [assigneeTouched, setAssigneeTouched] = useState(false)
  const [dueDate, setDueDate] = useState("")

  // Sincroniza o responsável sugerido conforme a seleção de clínicas muda,
  // enquanto o usuário não escolher manualmente (padrão render-time, sem efeito).
  const suggested = suggestAssignee(clinicIds)
  const [prevSuggested, setPrevSuggested] = useState(suggested)
  if (suggested !== prevSuggested) {
    setPrevSuggested(suggested)
    if (!assigneeTouched) setAssignedTo(suggested)
  }

  const filteredClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase()
    return q ? clinics.filter((c) => c.name.toLowerCase().includes(q)) : clinics
  }, [clinics, clinicQuery])

  function reset() {
    setTitle("")
    setDescription("")
    setClinicIds(initialClinicIds)
    setClinicQuery("")
    setCategory(defaultCategory)
    setPriority("media")
    setAssignedTo(suggestAssignee(initialClinicIds))
    setAssigneeTouched(false)
    setDueDate("")
  }

  function toggleClinic(id: string) {
    setClinicIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function submit() {
    startTransition(async () => {
      const res = await createTasksForClinics(clinicIds, {
        title,
        description,
        category,
        priority,
        assignedTo,
        dueDate,
      })
      if (res.ok) {
        toast.success(res.count > 1 ? `${res.count} tarefas criadas.` : "Tarefa criada.")
        setOpen(false)
        reset()
        onCreated()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger className={buttonVariants({ size: "sm" })}>
        <Plus className="size-4" />
        Nova tarefa
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Título
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Confirmar dados bancários"
              className="h-8"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Descrição (opcional)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          {/* Clínicas — múltipla seleção (cria uma tarefa por clínica) */}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>
                Clínicas{" "}
                {clinicIds.length > 0 ? (
                  <span className="text-foreground">· {clinicIds.length} selecionada{clinicIds.length !== 1 ? "s" : ""}</span>
                ) : (
                  <span>· vazio = tarefa interna</span>
                )}
              </span>
              {clinicIds.length > 0 && (
                <button type="button" onClick={() => setClinicIds([])} className="text-primary hover:underline">
                  limpar
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={clinicQuery}
                onChange={(e) => setClinicQuery(e.target.value)}
                placeholder="Buscar clínica…"
                className="h-8 pl-8"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {filteredClinics.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma clínica encontrada.</p>
              ) : (
                filteredClinics.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent/40"
                  >
                    <Checkbox checked={clinicIds.includes(c.id)} onCheckedChange={() => toggleClinic(c.id)} />
                    {c.name}
                  </label>
                ))
              )}
            </div>
            <p className="text-[0.7rem] text-muted-foreground/80">
              Selecione uma ou várias — cada clínica recebe uma tarefa própria.
            </p>
          </div>

          <TaskFields
            clinics={clinics}
            profiles={profiles}
            categories={categories}
            clinicId={null}
            onClinicIdChange={() => {}}
            hideClinic
            category={category}
            onCategoryChange={setCategory}
            priority={priority}
            onPriorityChange={setPriority}
            assignedTo={assignedTo}
            onAssignedToChange={(v) => {
              setAssignedTo(v)
              setAssigneeTouched(true)
            }}
            dueDate={dueDate}
            onDueDateChange={setDueDate}
          />
        </div>
        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
          <Button type="button" disabled={pending || title.trim().length < 3} onClick={submit}>
            {clinicIds.length > 1 ? `Criar ${clinicIds.length} tarefas` : "Criar tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
