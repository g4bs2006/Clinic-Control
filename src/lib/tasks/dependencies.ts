"use server";

// Dependências entre tarefas — "bloqueada por" (epic #33). N:N via
// task_dependencies (task_id = bloqueada, depends_on_task_id = bloqueadora).
//
// Bloqueio é RÍGIDO (decisão registrada no ADR 0008): updateTaskStatus /
// bulkUpdateTaskStatus (em actions.ts) recusam mover para "em_andamento" ou
// "concluida" enquanto houver bloqueadora ainda aberta. Vale só para a própria
// tarefa — não se propaga para subtarefas (parent_task_id é um eixo separado,
// como já era antes desta feature).
//
// Ciclo direto (A bloqueada por A) é pego pelo CHECK da migration; ciclo
// indireto (A bloqueada por B bloqueada por A) não dá pra expressar num CHECK
// simples — addDependency faz o BFS abaixo antes de inserir.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import type { TaskStatus } from "./categories";

const DONE_STATUSES = new Set<TaskStatus>(["concluida", "cancelada"]);
/** Status que exigem a tarefa desbloqueada para serem alcançados. */
const GATED_STATUSES = new Set<TaskStatus>(["em_andamento", "concluida"]);

export type DependencyTaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
};

type SingleOrArray<T> = T | T[] | null;
function firstOf<T>(v: SingleOrArray<T>): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

/** Tarefas que bloqueiam esta (precisam concluir antes dela avançar). */
export async function listBlockers(taskId: string): Promise<DependencyTaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("blocker:tasks!task_dependencies_depends_on_task_id_fkey(id, title, status)")
    .eq("task_id", taskId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => firstOf(row.blocker as SingleOrArray<DependencyTaskRow>))
    .filter((t): t is DependencyTaskRow => t != null);
}

/** Tarefas que esta bloqueia (visão inversa — "isso aqui trava o quê"). */
export async function listBlocking(taskId: string): Promise<DependencyTaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("blocked:tasks!task_dependencies_task_id_fkey(id, title, status)")
    .eq("depends_on_task_id", taskId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => firstOf(row.blocked as SingleOrArray<DependencyTaskRow>))
    .filter((t): t is DependencyTaskRow => t != null);
}

/**
 * Bloqueadoras ainda abertas, só quando `status` exige a tarefa livre —
 * usada por updateTaskStatus/bulkUpdateTaskStatus para decidir se recusa a
 * transição. Vazio = livre para seguir (nada bloqueando, ou o status não checa).
 */
export async function openBlockersFor(taskId: string, status: TaskStatus): Promise<DependencyTaskRow[]> {
  if (!GATED_STATUSES.has(status)) return [];
  const blockers = await listBlockers(taskId);
  return blockers.filter((b) => !DONE_STATUSES.has(b.status));
}

/**
 * Ids (dentre os informados) que têm ao menos uma bloqueadora aberta — usada
 * pelo board/lista para o indicador visual e pelo bulkUpdateTaskStatus para
 * decidir em lote sem uma query por tarefa.
 */
export async function listBlockedTaskIds(taskIds: string[]): Promise<Set<string>> {
  if (!taskIds.length) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("task_id, blocker:tasks!task_dependencies_depends_on_task_id_fkey(status)")
    .in("task_id", taskIds);
  if (error) throw new Error(error.message);
  const blocked = new Set<string>();
  for (const row of data ?? []) {
    const blocker = firstOf(row.blocker as SingleOrArray<{ status: TaskStatus }>);
    if (blocker && !DONE_STATUSES.has(blocker.status)) blocked.add(row.task_id as string);
  }
  return blocked;
}

/**
 * Percorre o grafo de dependências a partir de `from` seguindo "de quem
 * depende" — se alcançar `target`, um novo elo `target ← from` fecharia um
 * ciclo. Busca todas as arestas de uma vez (escala do app é pequena o
 * suficiente pra isso ser barato) em vez de uma query recursiva no banco.
 */
async function reaches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  target: string,
): Promise<boolean> {
  const { data, error } = await supabase.from("task_dependencies").select("task_id, depends_on_task_id");
  if (error) throw new Error(error.message);

  const dependsOn = new Map<string, string[]>();
  for (const row of data ?? []) {
    const t = row.task_id as string;
    const d = row.depends_on_task_id as string;
    const list = dependsOn.get(t);
    if (list) list.push(d);
    else dependsOn.set(t, [d]);
  }

  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === target) return true;
    for (const next of dependsOn.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** Marca `dependsOnTaskId` como bloqueadora de `taskId`. */
export async function addDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (taskId === dependsOnTaskId) return { ok: false, error: "Uma tarefa não pode bloquear ela mesma" };

  const supabase = await createClient();
  // dependsOnTaskId já depende (direta ou indiretamente) de taskId? Se sim,
  // o novo elo taskId→dependsOnTaskId fecha um ciclo.
  if (await reaches(supabase, dependsOnTaskId, taskId)) {
    return { ok: false, error: "Isso criaria uma dependência circular entre as tarefas" };
  }

  const { error } = await supabase
    .from("task_dependencies")
    .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId, created_by: user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Essa dependência já existe" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/tarefas");
  return { ok: true };
}

export async function removeDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tarefas");
  return { ok: true };
}
