"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  listNotifications,
  getUnreadNotificationCount,
  getRealtimeToken,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/lib/notifications/actions";
import type { NotificationRow, NotificationType } from "@/lib/notifications/types";

type Ctx = {
  count: number;
  items: NotificationRow[];
  loading: boolean;
  loadItems: () => Promise<void>;
  markRead: (id: string) => void;
  markAll: () => void;
  dismiss: (id: string) => void;
};

const NotificationContext = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications fora do NotificationProvider");
  return ctx;
}

// payload.new do Realtime vem em snake_case e sem o join do actor — mas o título
// já traz o nome embutido ("Fulano mencionou você"), então actor_name é dispensável.
function mapRealtimeRow(n: Record<string, unknown>): NotificationRow {
  return {
    id: n.id as string,
    type: n.type as NotificationType,
    actor_id: (n.actor_id as string | null) ?? null,
    actor_name: null,
    title: n.title as string,
    body: (n.body as string | null) ?? null,
    entity_type: (n.entity_type as string | null) ?? null,
    entity_id: (n.entity_id as string | null) ?? null,
    url: (n.url as string | null) ?? null,
    read_at: (n.read_at as string | null) ?? null,
    created_at: n.created_at as string,
  };
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    setCount(await getUnreadNotificationCount());
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listNotifications(20));
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback((id: string) => {
    // Otimista: marca lida na hora e ajusta o contador; reverte se o servidor recusar.
    let wasUnread = false;
    setItems((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.read_at) {
          wasUnread = true;
          return { ...n, read_at: new Date().toISOString() };
        }
        return n;
      }),
    );
    if (wasUnread) setCount((c) => Math.max(0, c - 1));
    void markNotificationRead(id).then((res) => {
      if (!res.ok) void refreshCount();
    });
  }, [refreshCount]);

  const markAll = useCallback(() => {
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    setCount(0);
    void markAllNotificationsRead().then((res) => {
      if (!res.ok) void refreshCount();
    });
  }, [refreshCount]);

  const dismiss = useCallback((id: string) => {
    // Otimista: remove da lista já; se era não-lida, baixa o contador. Reverte no erro.
    let wasUnread = false;
    setItems((prev) =>
      prev.filter((n) => {
        if (n.id === id) {
          wasUnread = !n.read_at;
          return false;
        }
        return true;
      }),
    );
    if (wasUnread) setCount((c) => Math.max(0, c - 1));
    void dismissNotification(id).then((res) => {
      if (!res.ok) {
        void refreshCount();
        void loadItems();
      }
    });
  }, [refreshCount, loadItems]);

  // Realtime (push) + carga inicial do contador.
  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    (async () => {
      await refreshCount();
      const auth = await getRealtimeToken();
      if (cancelled || !auth) return; // sem segredo → só polling

      client = createClient();
      client.realtime.setAuth(auth.token);
      channel = client
        .channel(`notif:${auth.userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "clinic_control",
            table: "notifications",
            filter: `recipient_id=eq.${auth.userId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            const n = mapRealtimeRow(payload.new as Record<string, unknown>);
            setCount((c) => c + 1);
            setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
            toast(n.title, { description: n.body ?? undefined });
          },
        )
        .subscribe();

      // Renova o token antes de expirar (ttl 1h → renova aos 50min).
      refreshTimer = setInterval(async () => {
        const r = await getRealtimeToken();
        if (r && client) client.realtime.setAuth(r.token);
      }, 50 * 60 * 1000);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (client && channel) client.removeChannel(channel);
    };
  }, [refreshCount]);

  // Rede de segurança: revalida o contador ao focar a aba e a cada 60s.
  useEffect(() => {
    const onFocus = () => void refreshCount();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => void refreshCount(), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, [refreshCount]);

  const value: Ctx = { count, items, loading, loadItems, markRead, markAll, dismiss };
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
