"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Botão de confirmar em vermelho — para ações irreversíveis (excluir etc.). */
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Confirmação destrutiva padronizada no Dialog do app — substitui o
 * window.confirm() nativo (visual do navegador, sem controle de estilo nem de
 * cópia). Uso: `const confirm = useConfirm(); if (!(await confirm({...}))) return`.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>")
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setOpts(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={opts !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent className="sm:max-w-md">
          {opts && (
            <>
              <DialogHeader>
                <DialogTitle>{opts.title}</DialogTitle>
                {opts.description && <DialogDescription>{opts.description}</DialogDescription>}
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => settle(false)}>
                  {opts.cancelLabel ?? "Cancelar"}
                </Button>
                <Button
                  variant={opts.destructive ? "destructive" : "default"}
                  onClick={() => settle(true)}
                  autoFocus
                >
                  {opts.confirmLabel ?? "Confirmar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
