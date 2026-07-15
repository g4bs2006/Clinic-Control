"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus, Search, Check, ArrowLeft, ArrowRight } from "lucide-react"
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
import type { TaskCategory, TaskPriority, TaskStatus } from "@/lib/tasks/categories"
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
  // Mobile: assistente em 3 passos (1 O quê · 2 Onde · 3 Detalhes). Desktop
  // mantém o formulário único — o estado é o mesmo, muda só a apresentação.
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [clinicIds, setClinicIds] = useState<string[]>(initialClinicIds)
  const [clinicQuery, setClinicQuery] = useState("")
  const [category, setCategory] = useState<TaskCategory>(defaultCategory)
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [assignedTo, setAssignedTo] = useState<string | null>(() => suggestAssignee(initialClinicIds))
  const [assigneeTouched, setAssigneeTouched] = useState(false)
  const [dueDate, setDueDate] = useState("")
  const [status, setStatus] = useState<TaskStatus>("pendente")

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
    setStep(1)
    setTitle("")
    setDescription("")
    setClinicIds(initialClinicIds)
    setClinicQuery("")
    setCategory(defaultCategory)
    setPriority("media")
    setAssignedTo(suggestAssignee(initialClinicIds))
    setAssigneeTouched(false)
    setDueDate("")
    setStatus("pendente")
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
        status,
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

  const titleOk = title.trim().length >= 3
  const clinicNames = clinicIds
    .map((id) => clinics.find((c) => c.id === id)?.name)
    .filter(Boolean) as string[]

  /* Campos de título + descrição (compartilhados entre wizard e desktop).
     Chamado como função ({titleFields()}), NÃO como <Componente/> — componente
     definido dentro do render é recriado a cada tecla e o input perde o foco. */
  function titleFields(autoFocus = false) {
    return (
      <>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Título
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Confirmar dados bancários"
            className="h-9 sm:h-8"
            autoFocus={autoFocus}
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
      </>
    )
  }

  /* Busca + lista de clínicas; `tall` = linhas altas para o toque (wizard). */
  function clinicPicker(tall = false) {
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            Clínicas{" "}
            {clinicIds.length > 0 ? (
              <span className="text-foreground">
                · {clinicIds.length} selecionada{clinicIds.length !== 1 ? "s" : ""}
              </span>
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
            className="h-9 pl-8 sm:h-8"
          />
        </div>
        <div className={`overflow-y-auto rounded-md border border-border ${tall ? "max-h-72" : "max-h-40"}`}>
          {filteredClinics.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma clínica encontrada.</p>
          ) : (
            filteredClinics.map((c) => {
              const selected = clinicIds.includes(c.id)
              return tall ? (
                // Wizard: linha inteira é o alvo, estado claro à direita — sem
                // checkbox pequeno no meio do caminho do scroll.
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClinic(c.id)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-border/30 px-3 py-3 text-left text-sm last:border-0 ${
                    selected ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-accent/40"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {selected && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              ) : (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent/40"
                >
                  <Checkbox checked={selected} onCheckedChange={() => toggleClinic(c.id)} />
                  {c.name}
                </label>
              )
            })
          )}
        </div>
        <p className="text-[0.7rem] text-muted-foreground/80">
          Selecione uma ou várias — cada clínica recebe uma tarefa própria.
        </p>
      </div>
    )
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
          <DialogTitle>
            Nova tarefa
            <span className="ml-2 text-xs font-normal text-muted-foreground sm:hidden">
              passo {step} de 3
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* ── Mobile: assistente em passos (uma decisão por tela) ── */}
        <div className="flex flex-col gap-3 sm:hidden">
          {step === 1 && (
            <>
              {titleFields()}
              <div className="mt-1 flex justify-end gap-2">
                <DialogClose className={buttonVariants({ variant: "ghost", className: "h-10" })}>
                  Cancelar
                </DialogClose>
                <Button type="button" className="h-10" disabled={!titleOk} onClick={() => setStep(2)}>
                  Avançar
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {clinicPicker(true)}
              <div className="mt-1 flex justify-between gap-2">
                <Button type="button" variant="ghost" className="h-10" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" />
                  Voltar
                </Button>
                <Button type="button" className="h-10" onClick={() => setStep(3)}>
                  Avançar
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-lg border border-border/60 bg-accent/20 px-3 py-2 text-xs text-muted-foreground">
                <p className="truncate font-medium text-foreground">{title}</p>
                <p className="mt-0.5 truncate">
                  {clinicNames.length === 0
                    ? "Tarefa interna (sem clínica)"
                    : clinicNames.length <= 2
                      ? clinicNames.join(", ")
                      : `${clinicNames.slice(0, 2).join(", ")} +${clinicNames.length - 2}`}
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
                status={status}
                onStatusChange={setStatus}
              />
              <div className="mt-1 flex justify-between gap-2">
                <Button type="button" variant="ghost" className="h-10" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" />
                  Voltar
                </Button>
                <Button type="button" className="h-10" disabled={pending || !titleOk} onClick={submit}>
                  {clinicIds.length > 1 ? `Criar ${clinicIds.length} tarefas` : "Criar tarefa"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ── Desktop: formulário único ── */}
        <div className="hidden flex-col gap-3 sm:flex">
          {titleFields(true)}
          {clinicPicker()}
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
            status={status}
            onStatusChange={setStatus}
          />
        </div>
        <DialogFooter className="hidden sm:flex">
          <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
          <Button type="button" disabled={pending || !titleOk} onClick={submit}>
            {clinicIds.length > 1 ? `Criar ${clinicIds.length} tarefas` : "Criar tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
