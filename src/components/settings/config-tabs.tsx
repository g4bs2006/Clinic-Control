"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { path: "", label: "Equipe & Conta", gestorOnly: false },
  { path: "/ia", label: "IA", gestorOnly: true },
  { path: "/tarefas", label: "Tarefas & Checklist", gestorOnly: false },
  { path: "/funil", label: "Funil & Status", gestorOnly: false },
  { path: "/whatsapp", label: "WhatsApp", gestorOnly: false },
]

/** Navegação por abas de /configuracoes — cada aba é uma sub-rota real
 *  (busca só os próprios dados). Scroll horizontal no mobile. */
export function ConfigTabs({ isGestor }: { isGestor: boolean }) {
  const pathname = usePathname()
  const base = "/configuracoes"

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border/60" aria-label="Seções das configurações">
      {TABS.filter((t) => isGestor || !t.gestorOnly).map((t) => {
        const href = `${base}${t.path}`
        const active = t.path === "" ? pathname === base : pathname.startsWith(href)
        return (
          <Link
            key={t.label}
            href={href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
