import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createNotifications, type NewNotification } from "./create";

// Fontes de notificação ligadas a tarefas/acompanhamentos. Server-only: as Server
// Actions chamam estes helpers depois de gravar. Nunca lançam (createNotifications
// engole erros) — notificar é efeito colateral.

type Actor = { id: string; name: string | null };

function excerpt(text: string, max = 140): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function taskContext(
  taskId: string,
): Promise<{ title: string; assignee_ids: string[]; created_by: string | null } | null> {
  const sb = createServiceClient();
  const [{ data: task }, { data: assignees }] = await Promise.all([
    sb.from("tasks").select("title, created_by").eq("id", taskId).maybeSingle(),
    sb.from("task_assignees").select("user_id").eq("task_id", taskId),
  ]);
  if (!task) return null;
  return {
    title: task.title as string,
    created_by: task.created_by as string | null,
    assignee_ids: (assignees ?? []).map((a) => a.user_id as string),
  };
}

/** Alguém virou responsável por uma tarefa. */
export async function notifyTaskAssigned(opts: {
  taskId: string;
  taskTitle?: string;
  assigneeId: string | null;
  actor: Actor;
}): Promise<void> {
  if (!opts.assigneeId || opts.assigneeId === opts.actor.id) return;
  const title = opts.taskTitle ?? (await taskContext(opts.taskId))?.title ?? "uma tarefa";
  await createNotifications([
    {
      recipientId: opts.assigneeId,
      actorId: opts.actor.id,
      type: "task_assigned",
      title: `${opts.actor.name ?? "Alguém"} atribuiu uma tarefa a você`,
      body: title,
      entityType: "task",
      entityId: opts.taskId,
      url: `/tarefas/${opts.taskId}`,
    },
  ]);
}

/**
 * Comentário numa tarefa → avisa (a) os mencionados e (b) os envolvidos
 * (responsável/criador) que não sejam o autor nem já mencionados.
 */
export async function notifyTaskComment(opts: {
  taskId: string;
  commentBody: string;
  mentionedIds: string[];
  actor: Actor;
}): Promise<void> {
  const ctx = await taskContext(opts.taskId);
  if (!ctx) return;

  const body = excerpt(opts.commentBody);
  const mentioned = new Set(opts.mentionedIds.filter(Boolean));
  const notifs: NewNotification[] = [];

  for (const uid of mentioned) {
    notifs.push({
      recipientId: uid,
      actorId: opts.actor.id,
      type: "mention",
      title: `${opts.actor.name ?? "Alguém"} mencionou você`,
      body,
      entityType: "task",
      entityId: opts.taskId,
      url: `/tarefas/${opts.taskId}`,
    });
  }

  const stakeholders = new Set<string>(ctx.assignee_ids);
  if (ctx.created_by) stakeholders.add(ctx.created_by);
  for (const uid of stakeholders) {
    if (uid === opts.actor.id || mentioned.has(uid)) continue;
    notifs.push({
      recipientId: uid,
      actorId: opts.actor.id,
      type: "task_comment",
      title: `${opts.actor.name ?? "Alguém"} comentou numa tarefa sua`,
      body: ctx.title,
      entityType: "task",
      entityId: opts.taskId,
      url: `/tarefas/${opts.taskId}`,
    });
  }

  await createNotifications(notifs);
}

/** Alguém virou responsável por um acompanhamento. */
export async function notifyAcompanhamentoAssigned(opts: {
  acompanhamentoId: string;
  title: string;
  assigneeId: string | null;
  actor: Actor;
}): Promise<void> {
  if (!opts.assigneeId || opts.assigneeId === opts.actor.id) return;
  await createNotifications([
    {
      recipientId: opts.assigneeId,
      actorId: opts.actor.id,
      type: "acompanhamento_assigned",
      title: `${opts.actor.name ?? "Alguém"} atribuiu um acompanhamento a você`,
      body: opts.title,
      entityType: "acompanhamento",
      entityId: opts.acompanhamentoId,
      url: `/acompanhamentos`,
    },
  ]);
}
