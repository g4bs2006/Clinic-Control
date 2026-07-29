"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MessageCircle, ChevronDown, Monitor, Globe, Copy, Check } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from "@/components/ui/popover"
import { waDigits } from "@/lib/clinics/partner-contacts"
import { cn } from "@/lib/utils"

/**
 * Botão de WhatsApp com escolha de COMO abrir — e que lembra a escolha.
 *
 * O problema que ele resolve (relatado em 2026-07-29): o link `wa.me` com
 * target="_blank" abre uma aba nova que redireciona para o WhatsApp Web, e o Web
 * só admite UMA sessão por navegador. Quem já tinha o WhatsApp Web aberto perdia
 * a sessão da aba antiga ("WhatsApp aberto em outra janela") e ainda acumulava
 * uma aba por clique. Nenhum truque de `target` conserta isso: o navegador não
 * deixa reaproveitar uma aba que o app não abriu.
 *
 * As saídas reais são não abrir o Web:
 *   app     → `whatsapp://send` entrega para o aplicativo instalado. Nenhuma aba,
 *             nenhuma sessão web disputada. É o padrão.
 *   web     → abre em janela NOMEADA, então os cliques seguintes reaproveitam a
 *             mesma aba em vez de empilhar (a sessão ainda é disputada uma vez).
 *   copiar  → copia o número para colar na conversa já aberta. Nunca atrapalha.
 *
 * No modo app não há como saber se o aplicativo existe. Em vez de adivinhar,
 * observamos: se a janela perder o foco, o app assumiu. Se depois de 1,5s nada
 * aconteceu, oferecemos Web e Copiar num toast.
 */

type Mode = "app" | "web" | "copiar"

const STORAGE_KEY = "cc-whatsapp-modo"
const WEB_WINDOW_NAME = "cc-whatsapp-web"

const MODE_LABEL: Record<Mode, string> = {
  app: "Abrir no aplicativo",
  web: "Abrir no WhatsApp Web",
  copiar: "Copiar o número",
}

function readMode(): Mode {
  if (typeof window === "undefined") return "app"
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === "web" || v === "copiar" || v === "app" ? v : "app"
}

async function copyNumber(digits: string) {
  try {
    await navigator.clipboard.writeText(`+${digits}`)
    toast.success("Número copiado", { description: `+${digits}` })
  } catch {
    // Clipboard rejeita em contexto não-seguro / documento sem foco. Sem este
    // aviso a pessoa cola o conteúdo ANTERIOR achando que copiou.
    toast.error("Não foi possível copiar", { description: `+${digits}` })
  }
}

function openWeb(digits: string) {
  // Janela nomeada: o próximo clique reaproveita esta aba em vez de abrir outra.
  window.open(`https://wa.me/${digits}`, WEB_WINDOW_NAME, "noopener,noreferrer")
}

function openApp(digits: string) {
  let assumiu = false
  const marcar = () => {
    assumiu = true
  }
  window.addEventListener("blur", marcar, { once: true })
  document.addEventListener("visibilitychange", marcar, { once: true })

  window.location.href = `whatsapp://send?phone=${digits}`

  window.setTimeout(() => {
    window.removeEventListener("blur", marcar)
    document.removeEventListener("visibilitychange", marcar)
    if (assumiu) return
    toast.warning("O aplicativo do WhatsApp não respondeu", {
      description: "Talvez não esteja instalado neste computador.",
      action: { label: "Abrir no Web", onClick: () => openWeb(digits) },
      cancel: { label: "Copiar número", onClick: () => void copyNumber(digits) },
      duration: 8000,
    })
  }, 1500)
}

export function WhatsAppButton({
  phone,
  className,
  label = "WhatsApp",
}: {
  phone: string | null | undefined
  className?: string
  /** Texto do botão. Passe "" para ficar só o ícone (linhas apertadas). */
  label?: string
}) {
  const digits = waDigits(phone)
  const [mode, setMode] = useState<Mode>(readMode)
  const [open, setOpen] = useState(false)

  if (!digits) return null

  function run(m: Mode) {
    if (m === "app") openApp(digits!)
    else if (m === "web") openWeb(digits!)
    else void copyNumber(digits!)
  }

  function choose(m: Mode) {
    setMode(m)
    window.localStorage.setItem(STORAGE_KEY, m)
    setOpen(false)
    run(m)
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden rounded-full bg-emerald-500/15 font-medium text-emerald-500",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => run(mode)}
        title={`${MODE_LABEL[mode]} · +${digits}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 transition-colors hover:bg-emerald-500/25"
      >
        <MessageCircle className="size-3" />
        {label}
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Escolher como abrir o WhatsApp"
              className="border-l border-emerald-500/25 px-1 py-0.5 transition-colors hover:bg-emerald-500/25"
            >
              <ChevronDown className="size-3" />
            </button>
          }
        />
        <PopoverContent side="bottom" align="end" className="w-64 p-1.5">
          <p className="px-1.5 pb-1.5 text-[0.65rem] text-muted-foreground">
            Como abrir · fica salvo para os próximos cliques
          </p>
          {(["app", "web", "copiar"] as Mode[]).map((m) => {
            const Icon = m === "app" ? Monitor : m === "web" ? Globe : Copy
            return (
              <PopoverClose
                key={m}
                render={
                  <button
                    type="button"
                    onClick={() => choose(m)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{MODE_LABEL[m]}</span>
                    {mode === m && <Check className="size-3.5 shrink-0 text-emerald-500" />}
                  </button>
                }
              />
            )
          })}
          <p className="px-1.5 pt-1.5 text-[0.65rem] text-muted-foreground">
            O aplicativo não disputa a sessão do WhatsApp Web que você já tem aberta.
          </p>
        </PopoverContent>
      </Popover>
    </span>
  )
}
