"use client"

// Registrar desligamento saiu do corpo da página para cá.
//
// Motivo: registrar churn é a ação mais RARA desta tela e ocupava o melhor
// espaço, empurrando para baixo o que se vem consultar (o histórico e o porquê).
// Como ação pontual, dialog é o lugar certo — e no mobile o componente já cai
// como bottom-sheet.

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ChurnForm } from "./churn-form"

interface ChurnRegisterDialogProps {
  clinics: { id: string; name: string }[]
  currentMonth: string
}

export function ChurnRegisterDialog({ clinics, currentMonth }: ChurnRegisterDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Mesma composição de classes do Button outline/sm — o padrão da casa é
          estilizar o Trigger direto (ver helena-link-dialog). */}
      <DialogTrigger className="inline-flex h-7 shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border px-2.5 text-[0.8rem] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50">
        Registrar desligamento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar desligamento</DialogTitle>
          <DialogDescription>
            A clínica sai da carteira ativa e a conversa do grupo é analisada.
          </DialogDescription>
        </DialogHeader>
        <ChurnForm
          clinics={clinics}
          currentMonth={currentMonth}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
