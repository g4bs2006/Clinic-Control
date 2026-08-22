import { describe, it, expect } from "vitest"
import {
  deriveAll, deriveAniversariantes, deriveAutomacao, deriveDashboard, deriveHelena,
  tally, isPending, type SystemFacts, type SystemsRow,
} from "@/lib/systems/types"

// A derivação de estado da matriz de /sistemas (ADR 0007).
//
// Este teste existe por um motivo específico, registrado no ADR: o estado de
// cada célula depende da forma do dado em TRÊS schemas de donos diferentes
// (`clinic_control`, `aniversariantes` que é do outro repo, `dashboards` que é
// de um terceiro). Se um deles mudar de forma, a coluna passa a mentir em
// silêncio — que é exatamente o modo de falha que a tela existe para matar.
//
// Os casos abaixo não são hipotéticos: cada um corresponde a uma linha real
// encontrada no banco em 2026-08-21.

const base: SystemFacts = {
  hasIntegrationRow: true,
  companyId: "company-1",
  hasHelenaToken: true,
  prontuario: "Clinicorp",
  automationEnabled: true,
  automationHasScheduledStep: true,
  automationMirrored: true,
  aniversariantesProvisioned: false,
  hasClinicorpCredential: true,
  dashboardExists: true,
  dashboardHasFunnel: true,
}
const f = (over: Partial<SystemFacts> = {}): SystemFacts => ({ ...base, ...over })

describe("Aniversariantes", () => {
  it("Clinicorp com tudo pronto é `pronta` — um clique, nada a digitar", () => {
    // O caso de 20 clínicas. Elas ficaram invisíveis por não haver esta tela.
    expect(deriveAniversariantes(f())).toBe("pronta")
  })

  it("provisionada é `ok`", () => {
    expect(deriveAniversariantes(f({ aniversariantesProvisioned: true }))).toBe("ok")
  })

  it("Clinicorp sem form_credentials completa é `parcial`, não `pronta`", () => {
    // A distinção importa: dá para provisionar, mas alguém tem que ir buscar o
    // dado. Chamar isso de "pronta" faria a fila prometer o que não cumpre.
    expect(deriveAniversariantes(f({ hasClinicorpCredential: false }))).toBe("parcial")
  })

  it("e-Clínica não exige credencial da Clinicorp", () => {
    expect(
      deriveAniversariantes(f({ prontuario: "e-Clínica", hasClinicorpCredential: false })),
    ).toBe("pronta")
  })

  it("sem company_id é `bloqueada` — o slug da tabela É o company_id", () => {
    expect(deriveAniversariantes(f({ companyId: null }))).toBe("bloqueada")
  })

  it("sem token Helena é `bloqueada` — a coluna é not-null na tabela", () => {
    expect(deriveAniversariantes(f({ hasHelenaToken: false }))).toBe("bloqueada")
  })

  it.each([["Google Agenda"], ["Controle Odonto"], [null]])(
    "prontuário %s é `na`, não pendência",
    (p) => {
      // Sem isto, 31 das 61 clínicas ativas apareceriam como pendência falsa e
      // metade da coluna seria ruído. É a alternativa recusada do ADR 0007.
      expect(deriveAniversariantes(f({ prontuario: p as string | null }))).toBe("na")
    },
  )

  it("`na` vence até quando já existiria linha provisionada", () => {
    // Elegibilidade é do prontuário, não do estado da outra tabela: uma linha
    // órfã não deve fazer a célula prometer suporte que o app não tem.
    expect(
      deriveAniversariantes(f({ prontuario: "Google Agenda", aniversariantesProvisioned: true })),
    ).toBe("na")
  })
})

describe("Dashboard", () => {
  it("existe com _funnel é `ok`", () => {
    expect(deriveDashboard(f())).toBe("ok")
  })

  it("existe SEM _funnel é `parcial` — ingere cards e não renderiza funil", () => {
    // Prime Odontocenter e Fernanda Vasconcellos, ambas ativas, ambas
    // ingerindo card. Invisíveis antes desta tela.
    expect(deriveDashboard(f({ dashboardHasFunnel: false }))).toBe("parcial")
  })

  it("não existe mas tem company_id é `pronta`", () => {
    expect(deriveDashboard(f({ dashboardExists: false }))).toBe("pronta")
  })

  it("não existe e sem company_id é `bloqueada`", () => {
    expect(deriveDashboard(f({ dashboardExists: false, companyId: null }))).toBe("bloqueada")
  })

  it("nunca é `na`: toda clínica terá dashboard", () => {
    // Foi essa decisão que dispensou um campo de "produtos contratados" —
    // ausência aqui é sempre pendência real.
    for (const p of ["Clinicorp", "e-Clínica", "Google Agenda", null]) {
      expect(deriveDashboard(f({ prontuario: p, dashboardExists: false }))).not.toBe("na")
    }
  })
})

describe("Automação", () => {
  it("ligada, com etapa e espelhada é `ok`", () => {
    expect(deriveAutomacao(f())).toBe("ok")
  })

  it("ligada aqui mas sem espelho no n8n é `parcial`", () => {
    // O caso que ninguém enxergava: o app acha que automatiza e o workflow não
    // conhece a clínica.
    expect(deriveAutomacao(f({ automationMirrored: false }))).toBe("parcial")
  })

  it("ligada sem etapa de agendamento é `parcial`", () => {
    expect(deriveAutomacao(f({ automationHasScheduledStep: false }))).toBe("parcial")
  })

  it("desligada é `off`", () => {
    expect(deriveAutomacao(f({ automationEnabled: false }))).toBe("off")
  })

  it("sem LINHA de integração Helena é `na`", () => {
    // Mesma regra que listAutomationOverview() aplica com um `continue`. O teste
    // é a existência da linha, não o company_id: hoje as duas coincidem, e
    // alinhar com a tela que já existia evita que as duas discordem depois.
    expect(deriveAutomacao(f({ hasIntegrationRow: false }))).toBe("na")
  })

  it("com linha mas sem company_id não é `na` — é o estado do enable", () => {
    // Caso que hoje não existe no banco, mas o tipo permite. Sem company_id não
    // há chave para espelhar no n8n (invariante documentada em SystemFacts),
    // então ligada cai em `parcial` — não em `na`, que diria "não se aplica".
    const semCompany = { companyId: null, automationMirrored: false }
    expect(deriveAutomacao(f(semCompany))).toBe("parcial")
    expect(deriveAutomacao(f({ ...semCompany, automationEnabled: false }))).toBe("off")
  })
})

describe("Helena", () => {
  it("company_id + token é `ok`; falta de qualquer um é `off`", () => {
    expect(deriveHelena(f())).toBe("ok")
    expect(deriveHelena(f({ companyId: null }))).toBe("off")
    expect(deriveHelena(f({ hasHelenaToken: false }))).toBe("off")
  })
})

describe("linha inteira e contagem", () => {
  it("um só pré-requisito ausente derruba três sistemas", () => {
    // "Volte a Sorrir/Matheus Vilela": ativa, sem company_id. A linha inteira
    // comunica a causa melhor que qualquer célula isolada.
    //
    // `dashboardExists: false` não é escolha do caso, é consequência: sem
    // company_id o actions.ts não tem chave para procurar o dashboard, então
    // essa combinação é a única que o servidor consegue produzir. A primeira
    // versão deste teste errou aqui — deixo registrado porque a derivação
    // depende de invariantes do caller que não são visíveis no tipo.
    // Todos os `false` abaixo seguem da ausência de company_id — ver as
    // invariantes em SystemFacts.
    const s = deriveAll(f({
      hasIntegrationRow: false, companyId: null, hasHelenaToken: false,
      dashboardExists: false, automationMirrored: false, aniversariantesProvisioned: false,
    }))
    expect(s).toEqual({
      automacao: "na",
      aniversariantes: "bloqueada",
      dashboard: "bloqueada",
      helena: "off",
    })
  })

  it("só `pronta`, `parcial` e `bloqueada` contam como pendência", () => {
    expect(["pronta", "parcial", "bloqueada"].every((s) => isPending(s as never))).toBe(true)
    expect(["ok", "off", "na"].some((s) => isPending(s as never))).toBe(false)
  })

  it("tally soma exatamente o total de linhas", () => {
    const rows: SystemsRow[] = [
      { clinicId: "a", clinicName: "A", prontuario: "Clinicorp", contractStatus: "active", states: deriveAll(f()), hints: {} },
      { clinicId: "b", clinicName: "B", prontuario: "Google Agenda", contractStatus: "active", states: deriveAll(f({ prontuario: "Google Agenda" })), hints: {} },
      { clinicId: "c", clinicName: "C", prontuario: "Clinicorp", contractStatus: "active", states: deriveAll(f({ aniversariantesProvisioned: true })), hints: {} },
    ]
    const t = tally(rows, "aniversariantes")
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(rows.length)
    // 1 pronta (A), 1 na (B), 1 ok (C) — o denominador "elegíveis" exclui o na.
    expect(t).toMatchObject({ pronta: 1, na: 1, ok: 1 })
    expect(rows.length - t.na).toBe(2)
  })
})
