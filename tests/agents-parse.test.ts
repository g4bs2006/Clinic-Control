import { describe, it, expect } from "vitest"
import { parseAgentFiles, type InputFile } from "@/lib/agents/parser"

describe("parseAgentFiles", () => {
  it("agrupa persona + estágios por agente, ordenados por posição", () => {
    const files: InputFile[] = [
      { path: "Prompts Sophia/FV_persona_sophia.md", content: "# Persona — Sophia | Clínica X\n\nEu sou a Sophia." },
      { path: "Prompts Sophia/FV_estagio_2_problema_implicacao.md", content: "# E2 — Problema\n\n..." },
      { path: "Prompts Sophia/FV_estagio_0_recepcao.md", content: "# E0 — Recepção e Memória | Sophia\n\n..." },
      { path: "Prompts Sophia/FV_estagio_10_bypass.md", content: "# E10 — Bypass\n\n..." },
      { path: "Configuracao/FV_objetivo_agente.md", content: "objetivo" },
      { path: "Database/FV_BK_objecoes.csv", content: "a,b,c" },
      { path: "briefing_clinica.md", content: "briefing" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents).toHaveLength(1)
    const sophia = agents[0]
    expect(sophia.name).toBe("Sophia")
    expect(sophia.unit).toBeNull()
    expect(sophia.persona_md).toContain("Eu sou a Sophia")
    // ordenado por position: 0, 2, 10 (não alfabético "10" < "2")
    expect(sophia.stages.map((s) => s.position)).toEqual([0, 2, 10])
    // nome vem do primeiro heading, sem a parte após "|"
    expect(sophia.stages[0].name).toBe("E0 — Recepção e Memória")
    expect(sophia.stages[0].slug).toBe("recepcao")
  })

  it("suporta múltiplos agentes e detecta unidade por subpasta", () => {
    const files: InputFile[] = [
      { path: "Prompts Sophia/X_persona_sophia.md", content: "persona sophia" },
      { path: "Prompts Carlos/Unidade Centro/X_estagio_0_recepcao.md", content: "# Recepção\n" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents.map((a) => a.name)).toEqual(["Carlos", "Sophia"])
    const carlos = agents.find((a) => a.name === "Carlos")!
    expect(carlos.unit).toBe("Unidade Centro")
    expect(carlos.stages).toHaveLength(1)
  })

  it("ignora arquivos sem pasta 'Prompts'", () => {
    const files: InputFile[] = [
      { path: "Configuracao/regras.md", content: "x" },
      { path: "briefing.md", content: "y" },
    ]
    expect(parseAgentFiles(files)).toHaveLength(0)
  })
})
