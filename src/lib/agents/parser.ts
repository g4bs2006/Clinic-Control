/**
 * Pure parser: turns an uploaded clinic folder (list of relative paths +
 * markdown content) into agents with persona + ordered stages.
 *
 * Convention (validado na pasta "Fernanda Vasconcellos/"):
 *   Prompts <Agente>/<PFX>_persona_<agente>.md        → persona do agente
 *   Prompts <Agente>/<PFX>_estagio_<N>_<slug>.md       → estágio N
 *   (opcional) Prompts <Agente>/<Unidade>/...          → unidade
 * Arquivos fora de "Prompts *" (Configuracao/, Database/, briefing) não viram
 * agentes — ficam só no repositório de arquivos.
 */

export type ParsedStage = {
  position: number
  slug: string
  name: string
  content_md: string
}

export type ParsedAgent = {
  name: string
  unit: string | null
  persona_md: string | null
  stages: ParsedStage[]
}

export type InputFile = { path: string; content: string }

// First markdown H1 (`# ...`), trimmed and stripped of trailing "| ..." parts.
function firstHeading(md: string): string | null {
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) return m[1].split("|")[0].trim()
  }
  return null
}

// "acolhimento_situacao" → "Acolhimento situação"-ish (slug fallback)
function humanizeSlug(slug: string): string {
  const s = slug.replace(/_/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Normalize path separators and split into segments.
function segments(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean)
}

export function parseAgentFiles(files: InputFile[]): ParsedAgent[] {
  const agents = new Map<string, ParsedAgent>()

  function getAgent(name: string, unit: string | null): ParsedAgent {
    const key = `${name}::${unit ?? ""}`
    let a = agents.get(key)
    if (!a) {
      a = { name, unit, persona_md: null, stages: [] }
      agents.set(key, a)
    }
    return a
  }

  for (const file of files) {
    const segs = segments(file.path)
    // Find the "Prompts <Nome>" segment (case-insensitive)
    const pi = segs.findIndex((s) => /^prompts\s+.+/i.test(s))
    if (pi === -1) continue // not an agent file

    const agentName = segs[pi].replace(/^prompts\s+/i, "").trim()
    // A segment between "Prompts X" and the file = unit (if any)
    const between = segs.slice(pi + 1, segs.length - 1)
    const unit = between.length ? between.join(" / ") : null
    const filename = segs[segs.length - 1]

    if (/_persona_/i.test(filename)) {
      const agent = getAgent(agentName, unit)
      agent.persona_md = file.content
      continue
    }

    const stageMatch = filename.match(/_estagio_(\d+)_(.+)\.md$/i)
    if (stageMatch) {
      const agent = getAgent(agentName, unit)
      const position = parseInt(stageMatch[1], 10)
      const slug = stageMatch[2]
      const name = firstHeading(file.content) ?? humanizeSlug(slug)
      agent.stages.push({ position, slug, name, content_md: file.content })
    }
  }

  // Sort stages by position; sort agents by name
  const result = Array.from(agents.values())
  for (const a of result) a.stages.sort((x, y) => x.position - y.position)
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}
