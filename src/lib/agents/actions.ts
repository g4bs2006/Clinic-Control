"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { parseAgentFiles, type InputFile } from "./parser"

// Gate: qualquer usuário autenticado (equipe interna), como nas demais actions.
async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return supabase
}

export type StageRow = {
  id: string
  position: number
  slug: string
  name: string
  content_md: string | null
  source: "imported" | "edited"
}
export type AgentRow = {
  id: string
  name: string
  unit: string | null
  persona_md: string | null
  source: "imported" | "edited"
  stages: StageRow[]
}

export async function listClinicAgents(clinicId: string): Promise<AgentRow[]> {
  const supabase = await createClient()
  const { data: agents } = await supabase
    .from("clinic_agents")
    .select("id, name, unit, persona_md, source")
    .eq("clinic_id", clinicId)
    .order("name")
  if (!agents?.length) return []

  const ids = agents.map((a) => a.id as string)
  const { data: stages } = await supabase
    .from("agent_stages")
    .select("id, agent_id, position, slug, name, content_md, source")
    .in("agent_id", ids)
    .order("position")

  const byAgent = new Map<string, StageRow[]>()
  for (const s of stages ?? []) {
    const arr = byAgent.get(s.agent_id as string) ?? []
    arr.push({
      id: s.id as string,
      position: s.position as number,
      slug: s.slug as string,
      name: s.name as string,
      content_md: (s.content_md as string | null) ?? null,
      source: s.source as "imported" | "edited",
    })
    byAgent.set(s.agent_id as string, arr)
  }

  return agents.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    unit: (a.unit as string | null) ?? null,
    persona_md: (a.persona_md as string | null) ?? null,
    source: a.source as "imported" | "edited",
    stages: byAgent.get(a.id as string) ?? [],
  }))
}

export async function saveAgentPersona(
  agentId: string,
  personaMd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await authed()
  if (!supabase) return { ok: false, error: "Não autenticado" }
  const { error } = await supabase
    .from("clinic_agents")
    .update({ persona_md: personaMd, source: "edited" })
    .eq("id", agentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/clinicas")
  return { ok: true }
}

export async function saveStageContent(
  stageId: string,
  contentMd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await authed()
  if (!supabase) return { ok: false, error: "Não autenticado" }
  const { error } = await supabase
    .from("agent_stages")
    .update({ content_md: contentMd, source: "edited" })
    .eq("id", stageId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/clinicas")
  return { ok: true }
}

/**
 * Importa agentes a partir dos arquivos da pasta (enviados pelo cliente).
 * Híbrido: só sobrescreve linhas ainda 'imported'; o que foi 'edited' é preservado.
 */
export async function importParsedAgents(
  clinicId: string,
  files: InputFile[],
): Promise<{ ok: true; agents: number; stages: number } | { ok: false; error: string }> {
  const supabase = await authed()
  if (!supabase) return { ok: false, error: "Não autenticado" }

  const parsed = parseAgentFiles(files)
  if (!parsed.length) return { ok: true, agents: 0, stages: 0 }

  let agentCount = 0
  let stageCount = 0

  for (const pa of parsed) {
    // Busca agente existente por (clinic_id, name)
    const { data: existing } = await supabase
      .from("clinic_agents")
      .select("id, source")
      .eq("clinic_id", clinicId)
      .eq("name", pa.name)
      .maybeSingle()

    let agentId: string
    if (!existing) {
      const { data: ins, error } = await supabase
        .from("clinic_agents")
        .insert({
          clinic_id: clinicId,
          name: pa.name,
          unit: pa.unit,
          persona_md: pa.persona_md,
          source: "imported",
        })
        .select("id")
        .single()
      if (error || !ins) return { ok: false, error: error?.message ?? "Falha ao inserir agente" }
      agentId = ins.id as string
      agentCount++
    } else {
      agentId = existing.id as string
      // Só atualiza persona/unit se ainda for 'imported'
      if (existing.source === "imported") {
        await supabase
          .from("clinic_agents")
          .update({ unit: pa.unit, persona_md: pa.persona_md })
          .eq("id", agentId)
      }
    }

    // Estágios
    for (const st of pa.stages) {
      const { data: exStage } = await supabase
        .from("agent_stages")
        .select("id, source")
        .eq("agent_id", agentId)
        .eq("position", st.position)
        .maybeSingle()

      if (!exStage) {
        await supabase.from("agent_stages").insert({
          agent_id: agentId,
          position: st.position,
          slug: st.slug,
          name: st.name,
          content_md: st.content_md,
          source: "imported",
        })
        stageCount++
      } else if (exStage.source === "imported") {
        await supabase
          .from("agent_stages")
          .update({ slug: st.slug, name: st.name, content_md: st.content_md })
          .eq("id", exStage.id as string)
      }
    }
  }

  revalidatePath("/clinicas")
  return { ok: true, agents: agentCount, stages: stageCount }
}
