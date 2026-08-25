"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  Search,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { CarteiraSwitcher } from "@/components/carteira-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { navItems } from "@/lib/nav-items";

const STORAGE_KEY = "cc-sidebar-pinned";
const PIN_EVENT = "cc-sidebar-pin-change";
const RAIL = "md:w-[3.75rem]";
const FULL = "md:w-60";

// O estado "fixado" vive no localStorage — lido via useSyncExternalStore para
// hidratar sem setState em effect (SSR renderiza destravado e o cliente corrige).
function subscribePinned(onChange: () => void) {
  window.addEventListener(PIN_EVENT, onChange);
  return () => window.removeEventListener(PIN_EVENT, onChange);
}

export function AppNav({
  user,
  carteira,
}: {
  user: { name: string; role: "gestor" | "desenvolvedor" } | null;
  /** Seletor global de carteira — só para gestor (null caso contrário). */
  carteira: { options: { id: string; name: string }[]; selected: string | null } | null;
}) {
  const pathname = usePathname();
  // pinned: user locked it open (persisted, desktop). peek: transient hover/focus.
  const pinned = useSyncExternalStore(
    subscribePinned,
    () => localStorage.getItem(STORAGE_KEY) === "1",
    () => false,
  );
  const [peek, setPeek] = useState(false);
  // No mobile a sidebar é um drawer sobreposto, aberto pelo hambúrguer da top bar.
  const [mobileOpen, setMobileOpen] = useState(false);
  // Dropdown de carteira aberto: o popup é portalado pra fora do <nav>, então
  // mexer nele dispararia mouseleave/click-outside e recolheria a sidebar.
  const [carteiraOpen, setCarteiraOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Hambúrguer da top bar (mobile) dispara este evento.
  useEffect(() => {
    const toggle = () => setMobileOpen((v) => !v);
    window.addEventListener("cc-toggle-nav", toggle);
    return () => window.removeEventListener("cc-toggle-nav", toggle);
  }, []);

  // Fecha o drawer ao navegar (troca de rota) — padrão render-time (sem setState
  // dentro de useEffect): compara o pathname atual com o último renderizado.
  const [navPath, setNavPath] = useState(pathname);
  if (pathname !== navPath) {
    setNavPath(pathname);
    setMobileOpen(false);
  }

  // Click outside collapses the transient peek (when not pinned) — desktop.
  useEffect(() => {
    if (pinned) return;
    function onPointerDown(e: MouseEvent) {
      if (carteiraOpen) return;
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setPeek(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [pinned, carteiraOpen]);

  function togglePin() {
    const next = !pinned;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(PIN_EVENT));
    if (next) setPeek(false);
  }

  // Expansão no desktop (rail → largura cheia). No mobile o drawer é sempre cheio.
  const desktopExpanded = pinned || peek || carteiraOpen;
  const open = desktopExpanded || mobileOpen;

  return (
    <>
      {/* Backdrop do drawer mobile */}
      {mobileOpen && (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[1150] bg-black/60 md:hidden"
        />
      )}

      <nav
        ref={navRef}
        aria-label="Navegação principal"
        // Footprint no flex: 0 no mobile (drawer sobrepõe), rail/cheio no desktop.
        // Só o PIN muda o footprint — o peek (hover) expande apenas o painel
        // fixo, por cima do conteúdo. Animar o footprint no hover refluía a
        // página a cada frame e forçava todos os gráficos Recharts visíveis a
        // redesenhar ~12x por abertura (o "travamento" com gráficos na tela).
        className={cn("relative w-0 shrink-0 md:transition-[width] md:duration-200 md:ease-out", pinned ? FULL : RAIL)}
        onMouseEnter={() => !pinned && setPeek(true)}
        onMouseLeave={() => !pinned && !carteiraOpen && setPeek(false)}
        onFocusCapture={() => !pinned && setPeek(true)}
      >
        {/* Painel visível — sobrepõe o conteúdo (nada reflui). */}
        <div
          className={cn(
            // z acima do Leaflet (panes/controles vão até ~1000)
            "fixed inset-y-0 left-0 z-[1200] flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar pl-[env(safe-area-inset-left)]",
            "transition-transform duration-200 ease-out md:transition-[width]",
            // Mobile: desliza pra dentro/fora. Desktop: sempre visível, largura anima.
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            "md:translate-x-0",
            desktopExpanded ? FULL : RAIL,
            peek && !pinned && "md:shadow-2xl md:shadow-black/60",
          )}
        >
          {/* Brand + pin (desktop) / fechar (mobile) */}
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
                className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex"
              >
                {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              </button>
            )}
            {/* Fechar — só mobile */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Global Search */}
          <div className="px-2 mb-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("cc-open-search"))}
              className={cn(
                "flex h-11 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/15 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all cursor-pointer md:h-9",
                open ? "px-3" : "justify-center px-0 size-11 md:size-9",
              )}
              title="Ir para página ou buscar clínica (Ctrl+K ou /)"
            >
              <Search className="size-4 shrink-0" />
              {open && (
                <>
                  <span className="flex-1 truncate text-sidebar-foreground/70">Buscar ou ir para...</span>
                  <span className="hidden text-[0.6rem] border border-sidebar-border bg-sidebar text-muted-foreground/80 rounded px-1.5 py-0.5 font-mono tabular-nums leading-none md:inline">
                    Ctrl+K · /
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Items */}
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
            {navItems
              .filter((item) => !item.gestorOnly || user?.role === "gestor")
              .map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={!open ? item.label : undefined}
                  className={cn(
                    "group relative flex h-11 items-center gap-2.5 rounded-md text-sm font-medium md:h-9",
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
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-current")} />
                  {open && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Seletor global de carteira — só gestor, visível com a sidebar aberta */}
          {open && carteira && (
            <div className="border-t border-sidebar-border px-3 py-2.5">
              <span className="mb-1.5 block text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Carteira
              </span>
              <CarteiraSwitcher
                options={carteira.options}
                selected={carteira.selected}
                onOpenChange={setCarteiraOpen}
              />
            </div>
          )}

          {/* Footer: usuário logado + sair */}
          <div className="border-t border-sidebar-border px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className={cn("flex items-center gap-2", !open && "justify-center")}>
              {open && <NotificationBell placement="sidebar" compact />}
              {open && user && (
                <div className="min-w-0 flex-1 px-1">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">{user.name}</p>
                  <p className="text-[0.65rem] capitalize text-muted-foreground/70">{user.role}</p>
                </div>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-red-400 md:size-8"
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
    </>
  );
}
