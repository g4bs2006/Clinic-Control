"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "./notification-context";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function NotificationBell({
  placement,
  expanded = false,
  compact = false,
}: {
  placement: "sidebar" | "topbar";
  expanded?: boolean;
  compact?: boolean;
}) {
  const { count, items, loading, loadItems, markRead, markAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void loadItems();
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, loadItems]);

  function onItemClick(id: string, url: string | null) {
    markRead(id);
    setOpen(false);
    if (url) router.push(url);
  }

  const badge =
    count > 0 ? (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-red-500 font-semibold text-white tabular-nums",
          placement === "topbar" || !expanded || compact
            ? "absolute -right-0.5 -top-0.5 min-w-4 px-1 py-px text-[0.6rem] leading-none"
            : "min-w-5 px-1.5 py-0.5 text-[0.65rem] leading-none",
        )}
      >
        {count > 9 ? "9+" : count}
      </span>
    ) : null;

  // Botão-gatilho, com estilo por local.
  const trigger =
    placement === "topbar" ? (
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-10 items-center justify-center rounded-md text-foreground hover:bg-accent"
      >
        <Bell className="size-5" />
        {badge}
      </button>
    ) : (
      <button
        type="button"
        aria-label="Notificações"
        title={!expanded ? "Notificações" : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-11 items-center gap-2.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground md:h-9",
          expanded && !compact ? "w-full px-2.5" : "size-11 justify-center md:size-9",
        )}
      >
        <Bell className="size-4 shrink-0" />
        {expanded && !compact && <span className="flex-1 truncate text-left">Notificações</span>}
        {badge}
      </button>
    );

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {open && (
        <div
          className={cn(
            "absolute z-[1300] flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/40",
            placement === "topbar"
              ? "right-0 top-full mt-2"
              : compact
                ? "bottom-0 left-full ml-2"
                : "bottom-0 left-full ml-2 md:bottom-auto md:top-0",
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notificações</span>
            {count > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check className="size-3.5" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma notificação por aqui.
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(n.id, n.url)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40",
                        !n.read_at && "bg-accent/20",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          n.read_at ? "bg-transparent" : "bg-brand",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-foreground">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[0.65rem] text-muted-foreground/70">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
