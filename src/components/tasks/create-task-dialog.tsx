"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { createTask } from "@/lib/tasks/actions"
import type { TaskCategory, TaskPriority } from "@/lib/tasks/categories"

export function CreateTaskDialog({
  clinics,
  profiles,
  defaultClinicId = null,
  onCreated,
}: {
  clinics: ClinicOption[]
  profiles: ProfileOption[]
  defaultClinicId?: string | null
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [clinicId, setClinicId] = useState<string | null>(defaultClinicId)
  const [category, setCategory] = useState<TaskCategory>("outro")
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState("")

  function reset() {
    setTitle("")
    setDescription("")
    setClinicId(defaultClinicId)
    setCategory("outro")
    setPriority("media")
    setAssignedTo(null)
    setDueDate("")
  }

  function submit() {
    startTransition(async () => {
      const res = await createTask({
        clinicId,
        title,
        description,
        category,
        priority,
        assignedTo,
        dueDate,
      })
      if (res.ok) {
        toast.success("Tarefa criada.")
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
          <TaskFields
            clinics={clinics}
            profiles={profiles}
            clinicId={clinicId}
            onClinicIdChange={setClinicId}
            category={category}
            onCategoryChange={setCategory}
            priority={priority}
            onPriorityChange={setPriority}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            dueDate={dueDate}
            onDueDateChange={setDueDate}
          />
        </div>
        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
          <Button type="button" disabled={pending || title.trim().length < 3} onClick={submit}>
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
