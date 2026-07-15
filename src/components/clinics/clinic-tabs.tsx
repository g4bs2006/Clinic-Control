"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { path: "", label: "Visão geral" },
  { path: "/atendimento", label: "Atendimento" },
  { path: "/ia", label: "IA & Custos" },
  { path: "/cadastro", label: "Cadastro" },
]

/** Navegação por abas da página da clínica — cada aba é uma sub-rota real
 *  (busca só os próprios dados). Scroll horizontal no mobile. */
export function ClinicTabs({ clinicId }: { clinicId: string }) {
  const pathname = usePathname()
  const base = `/clinicas/${clinicId}`

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border/60" aria-label="Seções da clínica">
      {TABS.map((t) => {
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
