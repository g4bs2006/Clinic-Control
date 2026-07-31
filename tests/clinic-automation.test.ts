import { describe, it, expect, vi } from "vitest";
import {
  detectAutomation,
  normalizeName,
  mergeDetectionIntoEmpty,
  warningsForEmptyFields,
  automationFunnelConflicts,
  automationReadiness,
  missingAutomationFields,
  EMPTY_AUTOMATION_CONFIG,
  type AutomationCatalog,
} from "@/lib/clinics/automation";
import { getPanelCustomFields, listContactTags } from "@/lib/helena/client";

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

// Catálogo "bem comportado": nomes exatamente como as contas da Helena que já
// estão em produção (a Atos é a única configurada 100% hoje).
function catalog(over: Partial<AutomationCatalog> = {}): AutomationCatalog {
  return {
    steps: [
      { id: "s-lead", title: "Leads", position: 1 },
      { id: "s-ag", title: "Agendados", position: 2 },
      { id: "s-canc", title: "Cancelados", position: 3 },
    ],
    customFields: [
      { key: "agendado_em", name: "Agendado em" },
      { key: "agendado_para", name: "Agendado para" },
      { key: "campanha", name: "Campanha" },
    ],
    panelTags: [
      { id: "t-ia", name: "IA" },
      { id: "t-fb", name: "Facebook" },
      { id: "t-ig", name: "Instagram" },
      { id: "t-org", name: "Orgânico" },
    ],
    contactTags: [
      { id: "c-ag", name: "Agendou IA" },
      { id: "c-fb", name: "Lead Facebook" },
      { id: "c-ig", name: "Lead Instagram" },
      { id: "c-org", name: "Lead Organico" },
    ],
    ...over,
  };
}

describe("normalizeName", () => {
  it("remove acento e caixa", () => {
    expect(normalizeName("Orgânico")).toBe("organico");
    expect(normalizeName("  AGENDADO Em ")).toBe("agendado em");
    expect(normalizeName(null)).toBe("");
  });
});

describe("detectAutomation", () => {
  it("resolve os 14 campos num catálogo completo, sem avisos", () => {
    const { config, warnings } = detectAutomation(catalog());
    expect(warnings).toEqual([]);
    expect(missingAutomationFields(config)).toEqual([]);
    expect(config.scheduledStepId).toBe("s-ag");
    expect(config.scheduledAtFieldKey).toBe("agendado_em");
    expect(config.campaignFieldKey).toBe("campanha");
    expect(config.orgPanelTagId).toBe("t-org"); // casou apesar do acento
    expect(config.orgContactTagId).toBe("c-org"); // casou sem o acento
  });

  it("etapa casa por nome EXATO — não confunde “Agendados” com “Agendados (retorno)”", () => {
    const { config, warnings } = detectAutomation(
      catalog({
        steps: [
          { id: "s-lead", title: "Leads", position: 1 },
          { id: "s-ag", title: "Agendados", position: 2 },
          { id: "s-ag2", title: "Agendados (retorno)", position: 3 },
        ],
      }),
    );
    expect(config.scheduledStepId).toBe("s-ag");
    // Cancelados não existe nesse painel → um aviso, e só esse campo afetado.
    expect(warnings.map((w) => w.field)).toEqual(["cancelledStepId"]);
  });

  it("devolve as candidatas quando há ambiguidade, em vez de só avisar", () => {
    const { config, warnings, candidates } = detectAutomation(
      catalog({
        panelTags: [
          { id: "t1", name: "Facebook" },
          { id: "t2", name: "Facebook Ads" },
          { id: "t-ia", name: "IA" },
          { id: "t-ig", name: "Instagram" },
          { id: "t-org", name: "Organico" },
        ],
      }),
    );
    expect(config.fbPanelTagId).toBeNull();
    expect(candidates.fbPanelTagId?.map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(warnings.find((w) => w.field === "fbPanelTagId")?.message).toContain("2 candidatas");
  });

  it("campo de data casa por CONTÉM (“Agendado em:” com dois-pontos)", () => {
    const { config } = detectAutomation(
      catalog({ customFields: [{ key: "k1", name: "Agendado em:" }] }),
    );
    expect(config.scheduledAtFieldKey).toBe("k1");
  });

  // Contas reais (31/07): a chave sai `campanha` ou `campanha-`, esta última
  // quando o nome foi cadastrado com dois-pontos — mesmo padrão de `agendado-em-`.
  it("Campanha casa por CONTÉM, com ou sem dois-pontos", () => {
    expect(
      detectAutomation(catalog({ customFields: [{ key: "campanha-", name: "Campanha:" }] }))
        .config.campaignFieldKey,
    ).toBe("campanha-");
    expect(
      detectAutomation(catalog({ customFields: [{ key: "campanha", name: "Campanha" }] })).config
        .campaignFieldKey,
    ).toBe("campanha");
  });

  it("catálogo vazio gera aviso para cada campo e nada resolvido", () => {
    const { config, warnings } = detectAutomation({
      steps: [],
      customFields: [],
      panelTags: [],
      contactTags: [],
    });
    expect(config).toEqual(EMPTY_AUTOMATION_CONFIG);
    expect(warnings).toHaveLength(14);
    expect(automationReadiness(config)).toBe("vazia");
  });
});

describe("mergeDetectionIntoEmpty", () => {
  it("preenche só o que está vazio — nunca sobrescreve escolha humana", () => {
    const saved = { ...EMPTY_AUTOMATION_CONFIG, scheduledStepId: "escolhido-a-mao" };
    const { config, filled } = mergeDetectionIntoEmpty(saved, detectAutomation(catalog()).config);
    expect(config.scheduledStepId).toBe("escolhido-a-mao");
    expect(config.cancelledStepId).toBe("s-canc");
    expect(filled).not.toContain("scheduledStepId");
    expect(filled).toContain("cancelledStepId");
  });
});

describe("warningsForEmptyFields", () => {
  it("descarta o aviso de campo que o gestor já preencheu", () => {
    const detection = detectAutomation({
      steps: [],
      customFields: [],
      panelTags: [],
      contactTags: [],
    });
    const config = { ...EMPTY_AUTOMATION_CONFIG, scheduledStepId: "manual" };
    const msgs = warningsForEmptyFields(detection.warnings, config);
    expect(msgs).toHaveLength(13);
    expect(msgs.some((m) => m.includes("Etapa Agendados"))).toBe(false);
  });
});

describe("automationFunnelConflicts", () => {
  const steps = [
    { id: "s-lead", title: "Leads", position: 1 },
    { id: "s-ag", title: "Agendados", position: 2 },
  ];

  it("acusa quando a automação move para coluna que a métrica não conta", () => {
    const conflicts = automationFunnelConflicts(
      { ...EMPTY_AUTOMATION_CONFIG, scheduledStepId: "s-ag" },
      { scheduledStepIds: ["outra-coluna"], leadStepIds: null },
      steps,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain("não entram na taxa");
  });

  it("distingue etapa que NÃO existe no painel de etapa não marcada como agendado", () => {
    // Caso real: Yamar, 2026-07-29 — o agendado_step_id herdado do n8n apontava
    // para uma etapa fora do painel vinculado. A mensagem antiga dizia só "não
    // está marcada como Agendado" e imprimia o uuid cru, escondendo o problema.
    const conflicts = automationFunnelConflicts(
      { ...EMPTY_AUTOMATION_CONFIG, scheduledStepId: "id-de-outro-painel" },
      { scheduledStepIds: ["s-ag"], leadStepIds: null },
      steps,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain("não existe no painel vinculado");
    expect(conflicts[0]).not.toContain("não entram na taxa");
  });

  it("não acusa quando a clínica não tem mapeamento de funil (cai no fallback)", () => {
    expect(
      automationFunnelConflicts(
        { ...EMPTY_AUTOMATION_CONFIG, scheduledStepId: "s-ag" },
        { scheduledStepIds: null, leadStepIds: null },
        steps,
      ),
    ).toEqual([]);
  });

  it("acusa chegada igual a agendamento", () => {
    const conflicts = automationFunnelConflicts(
      { ...EMPTY_AUTOMATION_CONFIG, scheduledStepId: "s-lead", leadStepId: "s-lead" },
      { scheduledStepIds: ["s-lead"], leadStepIds: ["s-lead"] },
      steps,
    );
    expect(conflicts.some((c) => c.includes("mesma coluna"))).toBe(true);
  });
});

describe("endpoints novos do client Helena", () => {
  it("getPanelCustomFields aceita array cru no topo", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok([
        { key: "k1", name: "Agendado em" },
        { key: "k2", name: "Agendado para" },
        { name: "sem key" },
      ]),
    ) as unknown as typeof fetch;
    const fields = await getPanelCustomFields("tok", "p1", { fetchImpl });
    expect(fields).toEqual([
      { key: "k1", name: "Agendado em" },
      { key: "k2", name: "Agendado para" },
    ]);
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain(
      "/crm/v1/panel/p1/custom-fields",
    );
  });

  it("listContactTags pagina quando vem {items, hasMorePages}", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ items: [{ id: "t1", name: "A" }], hasMorePages: true }))
      .mockResolvedValueOnce(
        ok({ items: [{ id: "t2", name: "B" }], hasMorePages: false }),
      ) as unknown as typeof fetch;
    const tags = await listContactTags("tok", { fetchImpl });
    expect(tags.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("listContactTags não entra em loop quando a resposta é array cru", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok([{ id: "t1", name: "A" }])) as unknown as typeof fetch;
    const tags = await listContactTags("tok", { fetchImpl });
    expect(tags).toHaveLength(1);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
