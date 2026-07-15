"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Só monta os filhos quando o bloco se aproxima da viewport. Gráficos Recharts
 * são caros de renderizar/hidratar — todos montando juntos no load seguram a
 * main thread e a navegação "trava". Abaixo da dobra, o custo só é pago se o
 * usuário rolar até lá.
 */
export function LazyMount({
  children,
  minHeight = 300,
  rootMargin = "250px",
}: {
  children: ReactNode
  /** Altura do placeholder (px) — próxima da real para não pular o layout. */
  minHeight?: number
  /** Antecedência da montagem em relação ao scroll. */
  rootMargin?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible, rootMargin])

  if (visible) return <>{children}</>
  return (
    <div
      ref={ref}
      style={{ minHeight }}
      aria-hidden
      className="animate-pulse rounded-md bg-muted/40"
    />
  )
}
