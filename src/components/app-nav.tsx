"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Início" },
  { href: "/clinicas", label: "Clínicas" },
  { href: "/mensal", label: "Mensal" },
  { href: "/comparativo", label: "Comparativo" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col w-56 min-h-screen bg-sidebar border-r border-border px-4 py-6 gap-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 px-2">
        Menu
      </p>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
