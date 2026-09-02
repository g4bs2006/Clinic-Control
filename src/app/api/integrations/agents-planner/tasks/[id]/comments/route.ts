import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyTaskComment } from "@/lib/notifications/task-events";
import { clinicIdsOwnedBy, verifyApiToken } from "@/lib/tokens/verify";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

/**
 * Read/write comment thread for a single task, for the Agents Planner
 * integration (see `../../tasks/route.ts` for the auth model). Unlike the
 * read-only routes, this one writes to `task_comments` — so scope is
 * re-checked per task instead of trusting the caller: a token only ever
 * touches a task if it's in the owner's carteira (`clinics.developer_id`) or
 * directly assigned to the owner, same rule `tasks/route.ts` applies to the
 * list.
 */

type NameRelation = { name: string | null } | { name: string | null }[] | null;
function unwrapName(rel: NameRelation): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

async function taskInScope(
  supabase: ReturnType<typeof createServiceClient>,
  taskId: string,
  userId: string,
): Promise<boolean> {
  const { data: task, error } = await supabase
    .from("tasks")
    .select("clinic_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !task) return false;

  if (task.clinic_id) {
    const clinicIds = await clinicIdsOwnedBy(userId);
    if (clinicIds.includes(task.clinic_id as string)) return true;
  }

  const { data: assignee } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(assignee);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyApiToken(request.headers.get("x-agents-planner-secret"));
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id: taskId } = await params;

  const supabase = createServiceClient();
  if (!(await taskInScope(supabase, taskId, auth.userId))) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("task_comments")
    .select("id, body, kind, author_id, created_at, updated_at, author:app_users!author_id(name)")
    .eq("task_id", taskId)
    .order("created_at");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const comments = (data ?? []).map((row) => ({
    id: row.id as string,
    body: row.body as string,
    kind: row.kind as "comment" | "system",
    authorId: row.author_id as string | null,
    authorName: unwrapName(row.author as NameRelation),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | null,
  }));

  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyApiToken(request.headers.get("x-agents-planner-secret"));
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id: taskId } = await params;

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "Comentário vazio" }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!(await taskInScope(supabase, taskId, auth.userId))) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: auth.userId, body, kind: "comment" })
    .select("id, body, kind, author_id, created_at, updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: author } = await supabase
    .from("app_users")
    .select("name")
    .eq("id", auth.userId)
    .maybeSingle();

  await notifyTaskComment({
    taskId,
    commentBody: body,
    mentionedIds: [],
    actor: { id: auth.userId, name: author?.name ?? null },
  });

  return NextResponse.json({
    comment: {
      id: data.id as string,
      body: data.body as string,
      kind: data.kind as "comment" | "system",
      authorId: data.author_id as string | null,
      authorName: author?.name ?? null,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string | null,
    },
  });
}
