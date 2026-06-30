/**
 * Parser das pastas de clínica → agentes (1 por unidade) com persona + estágios.
 *
 * As pastas chegam em formatos variados (validado em "01_Clinicas/"). O parser
 * tolera:
 *  - estágios em `Estagios/` OU `Prompt(s) <Nome>/`
 *  - nomes de estágio: `*_estagio_N_slug.md`, `*_E<N>_slug.md`,
 *    `Estagio_N_Slug.md` (sem prefixo) e `*_EA<N>_slug.md` (campanha)
 *  - persona em `*_persona_<nome>.md` (em Prompts/ ou Configuracao/); pode faltar
 *  - 1 agente por unidade: subpasta acima de Estagios/Prompts vira `unit`
 *    (data no nome é removida)
 *  - ignora pastas de versão/ruído: *Antigos*, *Corrigidos*, *Backup*,
 *    *reformulado*, _patch, logs, n8n
 *
 * Premissa: os caminhos incluem a pasta da clínica como 1º segmento
 * (comportamento de webkitRelativePath no upload de pasta).
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

const IGNORE_SEG = /(antig|backup|corrigid|reformulad|patch|^logs$|^old$|n8n)/i
const STANDARD_PARENT = /^(configuracao|database|base_conhecimento|estagios|prompts?\b)/i

function segments(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean)
}

function firstHeading(md: string): string | null {
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) return m[1].split("|")[0].trim()
  }
  return null
}

function humanizeSlug(slug: string): string {
  const s = slug.replace(/[_-]+/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Estágio"
}

// "Prompts Sophia" → "Sophia"; "Prompts Jéssica - GPT-4.1" → "Jéssica"
function agentFromPrompts(seg: string): string | null {
  const m = seg.match(/^prompts?\s+(.+)$/i)
  if (!m) return null
  const cleaned = m[1].replace(/\s*-\s*(reformulad|gpt|cr|v?\d).*$/i, "").trim()
  return cleaned || m[1].trim()
}

// "FV_persona_sophia.md" → "Sophia"
function personaNameFromFile(base: string): string | null {
  const m = base.match(/_persona_([a-zA-ZÀ-ÿ0-9]+)/i)
  if (!m) return null
  const n = m[1]
  return n.charAt(0).toUpperCase() + n.slice(1)
}

// "Prime Dente Botafogo - 29-05-2026" → "Prime Dente Botafogo"
function cleanUnit(seg: string): string {
  return seg.replace(/\s*-\s*\d{1,2}-\d{1,2}-\d{2,4}\s*$/, "").trim()
}

// Extrai posição + slug do nome do arquivo de estágio (vários padrões).
function parseStage(base: string): { position: number; slug: string } | null {
  const name = base.replace(/\.md$/i, "")
  let m = name.match(/(?:^|_)EA(\d+)[_-]?(.*)$/i)
  if (m) return { position: parseInt(m[1], 10), slug: (m[2] || "").toLowerCase() }
  m = name.match(/(?:^|_)estagio[_ ]?(\d+)[_-](.+)$/i)
  if (m) return { position: parseInt(m[1], 10), slug: m[2].toLowerCase() }
  m = name.match(/(?:^|_)E(\d+)[_-](.+)$/i)
  if (m) return { position: parseInt(m[1], 10), slug: m[2].toLowerCase() }
  return null
}

type Bucket = {
  unit: string | null
  promptsName: string | null
  personaName: string | null
  persona_md: string | null
  stages: ParsedStage[]
  seen: Set<number>
}

export function parseAgentFiles(files: InputFile[]): ParsedAgent[] {
  const buckets = new Map<string, Bucket>()

  function bucketFor(unit: string | null): Bucket {
    const key = unit ?? ""
    let b = buckets.get(key)
    if (!b) {
      b = { unit, promptsName: null, personaName: null, persona_md: null, stages: [], seen: new Set() }
      buckets.set(key, b)
    }
    return b
  }

  // ordem estável para dedup determinístico
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of ordered) {
    const segs = segments(file.path)
    if (segs.length < 2) continue
    const dirSegs = segs.slice(0, -1)
    const base = segs[segs.length - 1]

    if (dirSegs.some((s) => IGNORE_SEG.test(s))) continue
    if (!base.toLowerCase().endsWith(".md")) continue

    const isPersona = /_persona_/i.test(base)
    const stage = parseStage(base)
    if (!isPersona && !stage) continue // config/briefing → não vira agente

    // Acha o container (Prompts <Nome> ou Estagios) e deriva nome/unidade.
    let containerIdx = -1
    let promptsName: string | null = null
    for (let i = dirSegs.length - 1; i >= 0; i--) {
      if (/^prompts?\s+/i.test(dirSegs[i])) {
        containerIdx = i
        promptsName = agentFromPrompts(dirSegs[i])
        break
      }
      if (/^estagios$/i.test(dirSegs[i])) {
        containerIdx = i
        break
      }
    }

    // Unidade = pasta acima do container, desde que não seja o topo (clínica)
    // nem uma categoria padrão.
    let unit: string | null = null
    if (containerIdx >= 2) {
      const parent = dirSegs[containerIdx - 1]
      if (!STANDARD_PARENT.test(parent)) unit = cleanUnit(parent)
    }

    const b = bucketFor(unit)
    if (promptsName && !b.promptsName) b.promptsName = promptsName

    if (isPersona) {
      if (!b.persona_md) b.persona_md = file.content
      if (!b.personaName) b.personaName = personaNameFromFile(base)
    } else if (stage && !b.seen.has(stage.position)) {
      b.seen.add(stage.position)
      b.stages.push({
        position: stage.position,
        slug: stage.slug,
        name: firstHeading(file.content) ?? humanizeSlug(stage.slug),
        content_md: file.content,
      })
    }
  }

  const result: ParsedAgent[] = []
  for (const b of buckets.values()) {
    // bucket sem nada relevante é descartado
    if (!b.persona_md && b.stages.length === 0) continue
    b.stages.sort((x, y) => x.position - y.position)
    result.push({
      name: b.promptsName ?? b.personaName ?? "Agente",
      unit: b.unit,
      persona_md: b.persona_md,
      stages: b.stages,
    })
  }
  result.sort(
    (a, b) =>
      (a.unit ?? "").localeCompare(b.unit ?? "") || a.name.localeCompare(b.name),
  )
  return result
}
