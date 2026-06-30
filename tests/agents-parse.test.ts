import { describe, it, expect } from "vitest"
import { parseAgentFiles, type InputFile } from "@/lib/agents/parser"

// Premissa: caminhos incluem a pasta da clínica como 1º segmento.

describe("parseAgentFiles", () => {
  it("Prompts <Nome> com persona + estágios (padrão _estagio_N_)", () => {
    const files: InputFile[] = [
      { path: "Fernanda/Prompts Sophia/FV_persona_sophia.md", content: "# Persona — Sophia\n\nEu sou a Sophia." },
      { path: "Fernanda/Prompts Sophia/FV_estagio_2_problema.md", content: "# E2 — Problema" },
      { path: "Fernanda/Prompts Sophia/FV_estagio_0_recepcao.md", content: "# E0 — Recepção | Sophia" },
      { path: "Fernanda/Prompts Sophia/FV_estagio_10_bypass.md", content: "# E10" },
      { path: "Fernanda/Configuracao/FV_objetivo_agente.md", content: "objetivo" },
      { path: "Fernanda/briefing.md", content: "x" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe("Sophia")
    expect(agents[0].unit).toBeNull()
    expect(agents[0].persona_md).toContain("Eu sou a Sophia")
    expect(agents[0].stages.map((s) => s.position)).toEqual([0, 2, 10])
    expect(agents[0].stages[0].name).toBe("E0 — Recepção")
  })

  it("pasta Estagios/ com padrão _E<N>_ e persona em Configuracao", () => {
    const files: InputFile[] = [
      { path: "Biosorriso/Configuracao/bio_persona_sofia.md", content: "persona sofia" },
      { path: "Biosorriso/Estagios/BIO_E0_recepcao.md", content: "# Recepção" },
      { path: "Biosorriso/Estagios/BIO_E1_situacao.md", content: "# Situação" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe("Sofia") // veio do nome do arquivo de persona
    expect(agents[0].stages.map((s) => s.position)).toEqual([0, 1])
  })

  it("estágio sem prefixo (Estagio_N_Slug) e agente default", () => {
    const files: InputFile[] = [
      { path: "Arte Riso/Estagios/Estagio_0_Roteador.md", content: "# Roteador" },
      { path: "Arte Riso/Estagios/Estagio_10_Agendamento_Direto.md", content: "# Agendamento" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe("Agente")
    expect(agents[0].stages.map((s) => s.position)).toEqual([0, 10])
  })

  it("múltiplas unidades = um agente por unidade", () => {
    const files: InputFile[] = [
      { path: "Oral/OralConcept_Tirol/Prompts Haline/OC_persona_haline.md", content: "p" },
      { path: "Oral/OralConcept_Tirol/Prompts Haline/OC_E0_recepcao.md", content: "# r" },
      { path: "Oral/OralConceito_NovaEsperanca/Prompts Haline/OCO_E0_recepcao.md", content: "# r" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents).toHaveLength(2)
    expect(agents.map((a) => a.unit).sort()).toEqual(["OralConceito_NovaEsperanca", "OralConcept_Tirol"])
    expect(agents.every((a) => a.name === "Haline")).toBe(true)
  })

  it("data no nome da unidade é removida", () => {
    const files: InputFile[] = [
      { path: "Prime Dente/Prime Dente Botafogo - 29-05-2026/Estagios/PDM_E0_recepcao.md", content: "# r" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents[0].unit).toBe("Prime Dente Botafogo")
  })

  it("ignora pastas de versão/ruído (Antigos, Corrigidos, Backup, reformulado, n8n)", () => {
    const files: InputFile[] = [
      { path: "C/Estagios/X_E0_recepcao.md", content: "# atual" },
      { path: "C/Estagios_Antigos/X_E0_recepcao.md", content: "# velho" },
      { path: "C/Estagios_Corrigidos/X_E1_situacao.md", content: "# corrigido" },
      { path: "C/HB_reformulado/X_E2_problema.md", content: "# reformulado" },
      { path: "C/n8n/workflow_E0.md", content: "# n8n" },
    ]
    const agents = parseAgentFiles(files)
    expect(agents).toHaveLength(1)
    expect(agents[0].stages.map((s) => s.position)).toEqual([0]) // só o de Estagios/
  })

  it("ignora arquivos sem estágio/persona", () => {
    const files: InputFile[] = [
      { path: "C/Configuracao/regras.md", content: "x" },
      { path: "C/Database/objecoes.csv", content: "a,b" },
    ]
    expect(parseAgentFiles(files)).toHaveLength(0)
  })
})
