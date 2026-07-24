"use client";

import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";

/**
 * Barra superior só do mobile: hambúrguer que abre o drawer de navegação
 * (via evento cc-toggle-nav, escutado pelo AppNav) + marca + sino. Some no
 * desktop, onde a sidebar já é permanente.
 */
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-[1000] flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => window.dispatchEvent(new Event("cc-toggle-nav"))}
        className="flex size-10 items-center justify-center rounded-md text-foreground hover:bg-accent"
      >
        <Menu className="size-5" />
      </button>
      <span className="text-sm font-semibold tracking-tight text-foreground">Clinic Control</span>
      <div className="ml-auto">
        <NotificationBell placement="topbar" />
      </div>
    </header>
  );
}
