"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/tarefas", label: "Todas" },
  { href: "/tarefas/clinicas", label: "Das clínicas" },
  { href: "/tarefas/internas", label: "Internas" },
]

/**
 * Abas de escopo no topo de /tarefas (ADR 0009). A separação vive nas rotas
 * próprias — as tabs são só a navegação visível entre elas, no mesmo visual
 * segmentado do switcher de views do TaskBoard. A sidebar continua plana.
 */
export function TarefasScopeTabs() {
  const pathname = usePathname()
  return (
    <div className="flex w-fit items-center gap-0.5 rounded-md border border-border p-0.5">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }))}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
