"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  /** Valor pronto para copiar. Ignorado se getValue for passado. */
  value?: string
  /** Busca o valor sob demanda (ex.: segredo decriptado no servidor). Retornar null = falha já tratada/toastada. */
  getValue?: () => Promise<string | null>
  label: string
  className?: string
}

/**
 * Botão de copiar com feedback — promovido de clinic-form-credentials.tsx.
 * Trata rejeição do clipboard (contexto não-seguro, documento sem foco):
 * sem isso o writeText rejeita silenciosamente e o usuário cola o conteúdo
 * ANTERIOR do clipboard achando que copiou.
 */
export function CopyButton({ value, getValue, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      const text = getValue ? await getValue() : value
      if (text == null) return
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`${label} copiado`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(`Falha ao copiar ${label.toLowerCase()} — copie manualmente pelo botão de revelar`)
    }
  }, [value, getValue, label])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0",
        className
      )}
      title={`Copiar ${label.toLowerCase()}`}
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  )
}
