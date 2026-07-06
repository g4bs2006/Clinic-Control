"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  BarChart3,
  Map as MapIcon,
  MessageCircle,
  UserMinus,
  Plug,
  Settings,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  Search,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/clinicas", label: "Clínicas", icon: Building2 },
  { href: "/mensal", label: "Mensal", icon: CalendarDays },
  { href: "/comparativo", label: "Comparativo", icon: BarChart3 },
  { href: "/tarefas", label: "Tarefas", icon: ListTodo },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
  { href: "/whatsapp", label: "Gerenciador de grupos", icon: MessageCircle },
  { href: "/churns", label: "Churns", icon: UserMinus },
  { href: "/helena", label: "Contas Helena", icon: Plug },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const STORAGE_KEY = "cc-sidebar-pinned";
const PIN_EVENT = "cc-sidebar-pin-change";
const RAIL = "w-[3.75rem]";
const FULL = "w-60";

// O estado "fixado" vive no localStorage — lido via useSyncExternalStore para
// hidratar sem setState em effect (SSR renderiza destravado e o cliente corrige).
function subscribePinned(onChange: () => void) {
  window.addEventListener(PIN_EVENT, onChange);
  return () => window.removeEventListener(PIN_EVENT, onChange);
}

export function AppNav({
  user,
}: {
  user: { name: string; role: "gestor" | "desenvolvedor" } | null;
}) {
  const pathname = usePathname();
  // pinned: user locked it open (persisted). peek: transient hover/focus expand.
  const pinned = useSyncExternalStore(
    subscribePinned,
    () => localStorage.getItem(STORAGE_KEY) === "1",
    () => false,
  );
  const [peek, setPeek] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Click outside collapses the transient peek (when not pinned)
  useEffect(() => {
    if (pinned) return;
    function onPointerDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setPeek(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [pinned]);

  function togglePin() {
    const next = !pinned;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(PIN_EVENT));
    if (next) setPeek(false);
  }

  const open = pinned || peek;

  return (
    <nav
      ref={navRef}
      aria-label="Navegação principal"
      // Footprint reserved in the flex layout: rail width unless pinned open.
      className={cn("relative shrink-0 transition-[width] duration-200 ease-out", pinned ? FULL : RAIL)}
      onMouseEnter={() => !pinned && setPeek(true)}
      onMouseLeave={() => !pinned && setPeek(false)}
      onFocusCapture={() => !pinned && setPeek(true)}
    >
      {/* The visible panel — overlays content when peeking, so nothing reflows. */}
      <div
        className={cn(
          // z acima do Leaflet (panes/controles vão até ~1000), senão a sidebar fica sob o mapa
          "fixed inset-y-0 left-0 z-[1200] flex h-screen flex-col border-r border-sidebar-border bg-sidebar",
          "transition-[width] duration-200 ease-out",
          open ? FULL : RAIL,
          peek && !pinned && "shadow-2xl shadow-black/60",
        )}
      >
        {/* Brand + pin toggle */}
        <div className="flex h-14 items-center gap-2 px-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Activity className="size-4" />
          </div>
          {open && (
            <span className="flex-1 truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              Clinic Control
            </span>
          )}
          {open && (
            <button
              type="button"
              onClick={togglePin}
              aria-pressed={pinned}
              aria-label={pinned ? "Desafixar menu" : "Fixar menu aberto"}
              title={pinned ? "Desafixar" : "Fixar aberto"}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              {pinned ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
            </button>
          )}
        </div>
        
        {/* Global Search Button */}
        <div className="px-2 mb-2 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("cc-open-search"))}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/15 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all cursor-pointer",
              open ? "px-3" : "justify-center px-0 size-9"
            )}
            title="Buscar clínica (Ctrl+K)"
          >
            <Search className="size-4 shrink-0" />
            {open && (
              <>
                <span className="flex-1 truncate text-sidebar-foreground/70">Buscar clínica...</span>
                <span className="text-[0.6rem] border border-sidebar-border bg-sidebar text-muted-foreground/80 rounded px-1.5 py-0.5 font-mono tabular-nums leading-none">
                  Ctrl+K
                </span>
              </>
            )}
          </button>
        </div>

        {/* Items */}
        <div className="flex flex-1 flex-col gap-0.5 px-2">
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
                title={!open ? item.label : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-2.5 rounded-md text-sm font-medium",
                  "transition-colors duration-150",
                  open ? "px-2.5" : "justify-center px-0",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
                )}
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : "text-current",
                  )}
                />
                {open && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Footer: usuário logado + sair */}
        <div className="border-t border-sidebar-border px-2 py-2">
          <div className={cn("flex items-center gap-2", !open && "justify-center")}>
            {open && user && (
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user.name}
                </p>
                <p className="text-[0.65rem] capitalize text-muted-foreground/70">
                  {user.role}
                </p>
              </div>
            )}
            <form action={signOut}>
              <button
                type="submit"
                title="Sair da conta"
                aria-label="Sair da conta"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-red-400"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        {open && (
          <div className="px-4 pb-3 text-[0.65rem] leading-tight text-muted-foreground/70">
            Contact.IA · carteira de clínicas
          </div>
        )}
      </div>
    </nav>
  );
}
