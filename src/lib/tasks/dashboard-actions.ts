"use server"

import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"

export type TaskCounts = { attachments: number; comments: number }

/**
 * Conta anexos e comentários (kind='comment', exclui os de sistema) de um lote
 * de tarefas — para o bloco "Concluídas em foco" do panorama sinalizar quais
 * têm entrega/discussão sem abrir cada uma. Os ids vêm da lista já escopada por
 * carteira no cliente; aqui só exige sessão. Teto de 200 ids por chamada.
 */
export async function getTaskCounts(
  taskIds: string[],
): Promise<Record<string, TaskCounts>> {
  const out: Record<string, TaskCounts> = {}
  if (!(await getSessionUser())) return out
  const ids = [...new Set(taskIds)].slice(0, 200)
  if (ids.length === 0) return out
  for (const id of ids) out[id] = { attachments: 0, comments: 0 }

  const supabase = await createClient()
  const [{ data: atts }, { data: cmts }] = await Promise.all([
    supabase.from("task_attachments").select("task_id").in("task_id", ids),
    supabase.from("task_comments").select("task_id").in("task_id", ids).eq("kind", "comment"),
  ])
  for (const r of atts ?? []) {
    const k = r.task_id as string
    if (out[k]) out[k].attachments++
  }
  for (const r of cmts ?? []) {
    const k = r.task_id as string
    if (out[k]) out[k].comments++
  }
  return out
}
