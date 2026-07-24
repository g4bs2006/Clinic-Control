import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { NotificationType } from "./types";

// Helper interno de criação de notificações. NÃO é um Server Action ("use server")
// de propósito: só o servidor cria notificações — o client nunca chama isto direto.
// As fontes (menção, atribuição, comentário, cron de prazo) importam createNotifications.

export type NewNotification = {
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: "task" | "acompanhamento" | "comment" | null;
  entityId?: string | null;
  url?: string | null;
  /** Chave estável p/ deduplicar (ex.: lembrete de prazo). Null = sempre insere. */
  dedupeKey?: string | null;
};

/**
 * Insere notificações em lote. Nunca lança: notificar é efeito colateral e não
 * pode derrubar a ação que a originou. Pula auto-notificação (recipient == actor)
 * e ignora duplicatas por dedupe_key.
 */
export async function createNotifications(items: NewNotification[]): Promise<void> {
  const rows = items
    .filter((n) => n.recipientId && n.recipientId !== n.actorId)
    .map((n) => ({
      recipient_id: n.recipientId,
      actor_id: n.actorId ?? null,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      entity_type: n.entityType ?? null,
      entity_id: n.entityId ?? null,
      url: n.url ?? null,
      dedupe_key: n.dedupeKey ?? null,
    }));
  if (rows.length === 0) return;

  try {
    const supabase = createServiceClient();
    // ignoreDuplicates: linhas cujo dedupe_key já existe são puladas (nulls são
    // distintos, então eventos sem chave sempre entram).
    const { error } = await supabase
      .from("notifications")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) console.error("createNotifications:", error.message);
  } catch (e) {
    console.error("createNotifications:", e instanceof Error ? e.message : e);
  }
}
