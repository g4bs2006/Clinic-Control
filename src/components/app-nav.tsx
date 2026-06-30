"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  BarChart3,
  Map as MapIcon,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/clinicas", label: "Clínicas", icon: Building2 },
  { href: "/mensal", label: "Mensal", icon: CalendarDays },
  { href: "/comparativo", label: "Comparativo", icon: BarChart3 },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const STORAGE_KEY = "cc-sidebar-collapsed";

export function AppNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore persisted state after mount (avoids hydration mismatch)
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <nav
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r border-sidebar-border bg-sidebar",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[3.75rem]" : "w-60",
      )}
    >
      {/* Brand + collapse toggle */}
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Activity className="size-4" />
        </div>
        {!collapsed && (
          <span className="flex-1 truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
            Clinic Control
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir" : "Recolher"}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground",
            "hover:bg-sidebar-accent hover:text-sidebar-foreground",
            collapsed && "absolute left-1/2 top-14 -translate-x-1/2",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      {/* Items */}
      <div className={cn("flex flex-1 flex-col gap-0.5 px-2", collapsed && "mt-8")}>
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium",
                "transition-colors duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
              )}
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isActive ? "text-primary" : "text-current",
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 text-[0.65rem] leading-tight text-muted-foreground/70">
          Contact.IA · carteira de clínicas
        </div>
      )}
    </nav>
  );
}
