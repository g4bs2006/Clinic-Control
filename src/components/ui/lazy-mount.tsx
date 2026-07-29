"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

// Capacidade do navegador é estado EXTERNO ao React: nunca muda durante a vida
// da página, então a assinatura é um no-op. Lido por useSyncExternalStore em vez
// de setState num efeito — que gerava render em cascata (e era o que o lint
// apontava). getServerSnapshot devolve `true`: no SSR assumimos que dá para
// observar, e o navegador sem IntersectionObserver corrige depois da hidratação.
const subscribeNever = () => () => {}
const hasIO = () => typeof IntersectionObserver !== "undefined"
const hasIOOnServer = () => true

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
  const canObserve = useSyncExternalStore(subscribeNever, hasIO, hasIOOnServer)

  useEffect(() => {
    const el = ref.current
    if (!el || visible || !canObserve) return
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
  }, [visible, rootMargin, canObserve])

  // Sem IntersectionObserver não há como saber quando aproximou: monta tudo, que
  // é o comportamento seguro (era o mesmo de antes, só decidido em render).
  if (visible || !canObserve) return <>{children}</>
  return (
    <div
      ref={ref}
      style={{ minHeight }}
      aria-hidden
      className="animate-pulse rounded-md bg-muted/40"
    />
  )
}
