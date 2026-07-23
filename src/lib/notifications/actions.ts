"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import type { NotificationRow, NotificationType } from "./types";

type SingleOrArray<T> = T | T[] | null;
function unwrapName(rel: SingleOrArray<{ name: string | null }>): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

const NOTIFICATION_SELECT =
  "id, type, actor_id, title, body, entity_type, entity_id, url, read_at, created_at, actor:app_users!actor_id(name)";

function mapRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string,
    type: row.type as NotificationType,
    actor_id: row.actor_id as string | null,
    actor_name: unwrapName(row.actor as SingleOrArray<{ name: string | null }>),
    title: row.title as string,
    body: row.body as string | null,
    entity_type: row.entity_type as string | null,
    entity_id: row.entity_id as string | null,
    url: row.url as string | null,
    read_at: row.read_at as string | null,
    created_at: row.created_at as string,
  };
}

/** Notificações do usuário logado (mais recentes primeiro). */
export async function listNotifications(limit = 20): Promise<NotificationRow[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapRow);
}

/** Contador de não-lidas (para o badge do sino). */
export async function getUnreadNotificationCount(): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

/** Marca uma notificação como lida (só se for do próprio usuário). */
export async function markNotificationRead(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Marca todas as não-lidas do usuário como lidas. */
export async function markAllNotificationsRead(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
