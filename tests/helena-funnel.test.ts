import { describe, it, expect } from "vitest";
import { buildLiveFunnel, buildDailyFunnel } from "@/lib/helena/funnel";

const steps = [
  { id: "s1", title: "Leads", position: 1, cardCount: 0, monetaryAmount: 0 },
  { id: "s2", title: "Agendados", position: 2, cardCount: 0, monetaryAmount: 0 },
  { id: "s3", title: "Não Agendados", position: 3, cardCount: 0, monetaryAmount: 0 },
  { id: "s4", title: "Reagendados", position: 4, cardCount: 0, monetaryAmount: 0 },
  { id: "s5", title: "Cancelados", position: 5, cardCount: 0, monetaryAmount: 0 },
  { id: "s6", title: "Faltosos", position: 6, cardCount: 0, monetaryAmount: 0 },
  { id: "s7", title: "Orçamento em Aberto", position: 7, cardCount: 0, monetaryAmount: 0 },
  { id: "s8", title: "Compareceram e Não Fecharam", position: 8, cardCount: 0, monetaryAmount: 0 },
  { id: "s9", title: "Compareceram e Fecharam", position: 9, cardCount: 0, monetaryAmount: 0 },
];
const card = (
  id: string,
  stepId: string,
  amount: number | null = null,
  createdAt = "2026-06-10T00:00:00Z",
  tagIds: string[] = [],
) => ({ id, stepId, title: id, monetaryAmount: amount, createdAt, tagIds });

describe("buildLiveFunnel", () => {
  it("conta por etapa e calcula taxa", () => {
    const r = buildLiveFunnel(steps, [card("a", "s1"), card("b", "s1"), card("c", "s1"), card("d", "s1"), card("e", "s1"), card("f", "s2")]);
    expect(r.leads).toBe(6); // 6 cards no total
    expect(r.scheduled).toBe(1);
    expect(r.rate).toBeCloseTo(1 / 6);
  });

  it("taxa 0 quando não há leads", () => {
    expect(buildLiveFunnel(steps, []).rate).toBe(0);
  });

  it("soma faturamento da etapa de fechamento", () => {
    const r = buildLiveFunnel(steps, [card("a", "s9", 1000), card("b", "s9", 500), card("c", "s2", 999)]);
    expect(r.revenue).toBe(1500);
  });

  it("conta agendado cumulativamente: quem avançou no funil continua contando", () => {
    // 9 leads; 1 parado em Agendados, 1 em Reagendados, 1 em Faltosos,
    // 1 em Orçamento em Aberto, 1 em Compareceram e Não Fecharam,
    // 1 em Compareceram e Fecharam = 6 "agendaram" em algum momento.
    // Não Agendados e Cancelados NÃO contam.
    const r = buildLiveFunnel(steps, [
      card("a", "s1"), card("b", "s1"), // Leads puros
      card("c", "s2"), // Agendados
      card("d", "s3"), // Não Agendados
      card("e", "s4"), // Reagendados
      card("f", "s5"), // Cancelados
      card("g", "s6"), // Faltosos
      card("h", "s7"), // Orçamento em Aberto
      card("i", "s8"), // Compareceram e Não Fecharam
      card("j", "s9"), // Compareceram e Fecharam
    ]);
    expect(r.leads).toBe(10);
    expect(r.scheduled).toBe(6);
  });

  it("sem tagMapping, todo agendado cai em não classificado", () => {
    const r = buildLiveFunnel(steps, [card("a", "s2", null, undefined, ["tag-crc"])]);
    expect(r.scheduled).toBe(1);
    expect(r.scheduledByCrc).toBe(0);
    expect(r.scheduledByIa).toBe(0);
    expect(r.scheduledUnclassified).toBe(1);
  });
});

describe("buildLiveFunnel com mapeamento de etiqueta (CRC/IA)", () => {
  it("classifica agendado por etiqueta do card, ignorando leads não-agendados", () => {
    const tagMapping = { crcTagIds: ["tag-crc"], iaTagIds: ["tag-ia"] };
    const r = buildLiveFunnel(
      steps,
      [
        card("a", "s2", null, undefined, ["tag-crc"]), // agendado por CRC
        card("b", "s2", null, undefined, ["tag-ia"]), // agendado por IA
        card("c", "s2", null, undefined, []), // agendado sem etiqueta → não classificado
        card("d", "s2", null, undefined, ["tag-removida"]), // etiqueta desconhecida → não classificado
        card("e", "s1", null, undefined, ["tag-crc"]), // lead puro (não agendado) — etiqueta irrelevante aqui
      ],
      null,
      tagMapping,
    );
    expect(r.scheduled).toBe(4);
    expect(r.scheduledByCrc).toBe(1);
    expect(r.scheduledByIa).toBe(1);
    expect(r.scheduledUnclassified).toBe(2);
  });

  it("card com as duas etiquetas conta como CRC (prioridade sobre IA)", () => {
    const tagMapping = { crcTagIds: ["tag-crc"], iaTagIds: ["tag-ia"] };
    const r = buildLiveFunnel(
      steps,
      [card("a", "s2", null, undefined, ["tag-crc", "tag-ia"])],
      null,
      tagMapping,
    );
    expect(r.scheduledByCrc).toBe(1);
    expect(r.scheduledByIa).toBe(0);
  });
});

describe("buildLiveFunnel com mapping por coluna", () => {
  // Painel não-canônico: títulos arbitrários, classificação por stepId.
  const custom = [
    { id: "c1", title: "Novo contato", position: 1, cardCount: 0, monetaryAmount: 0 },
    { id: "c2", title: "Consulta marcada", position: 2, cardCount: 0, monetaryAmount: 0 },
    { id: "c3", title: "Compareceu", position: 3, cardCount: 0, monetaryAmount: 0 },
    { id: "c4", title: "Fechado", position: 4, cardCount: 0, monetaryAmount: 0 },
  ];

  it("classifica agendado/fechamento por stepId, ignorando títulos", () => {
    const r = buildLiveFunnel(
      custom,
      [
        card("a", "c1"), // lead puro
        card("b", "c2"), // agendado
        card("c", "c3"), // agendado
        card("d", "c4", 800), // fechado (também conta como agendado)
      ],
      { scheduledStepIds: ["c2", "c3"], closingStepIds: ["c4"], leadStepIds: ["c1"] },
    );
    expect(r.leads).toBe(4); // todos os cards
    expect(r.scheduled).toBe(3); // c2, c3 e c4 (fechamento entra em agendado)
    expect(r.revenue).toBe(800); // só o valor do card em coluna de fechamento
    expect(r.rate).toBeCloseTo(3 / 4);
  });

  it("fechamento é subconjunto de agendado mesmo sem estar em scheduledStepIds", () => {
    const r = buildLiveFunnel(
      custom,
      [card("a", "c1"), card("b", "c4", 500)],
      { scheduledStepIds: [], closingStepIds: ["c4"] },
    );
    expect(r.scheduled).toBe(1); // o card em c4 conta como agendado
    expect(r.revenue).toBe(500);
  });

  it("step_counts reflete as etapas reais do painel na ordem de posição", () => {
    const r = buildLiveFunnel(
      custom,
      [card("a", "c1"), card("b", "c1"), card("c", "c2")],
      { scheduledStepIds: ["c2"] },
    );
    expect(r.steps).toEqual([
      { title: "Novo contato", count: 2 },
      { title: "Consulta marcada", count: 1 },
      { title: "Compareceu", count: 0 },
      { title: "Fechado", count: 0 },
    ]);
  });

  it("no-show conta como agendado; não-agendou fica fora de agendado", () => {
    const painel = [
      { id: "n1", title: "Entrada", position: 1, cardCount: 0, monetaryAmount: 0 },
      { id: "n2", title: "Marcou", position: 2, cardCount: 0, monetaryAmount: 0 },
      { id: "n3", title: "Furou", position: 3, cardCount: 0, monetaryAmount: 0 },
      { id: "n4", title: "Desistiu", position: 4, cardCount: 0, monetaryAmount: 0 },
    ];
    const r = buildLiveFunnel(
      painel,
      [
        card("a", "n1"), // lead puro
        card("b", "n2"), // agendado
        card("c", "n3"), // no-show (⊂ agendado)
        card("d", "n4"), // não agendou
      ],
      { scheduledStepIds: ["n2"], noshowStepIds: ["n3"], notScheduledStepIds: ["n4"] },
    );
    expect(r.leads).toBe(4);
    expect(r.scheduled).toBe(2); // n2 + n3 (no-show agendou em algum momento)
    expect(r.noShow).toBe(1);
    expect(r.notScheduled).toBe(1);
  });

  it("compareceu: fechamento conta como compareceu; taxa de fechamento = fechados/compareceu", () => {
    const painel = [
      { id: "c1", title: "Novo", position: 1, cardCount: 0, monetaryAmount: 0 },
      { id: "c2", title: "Marcado", position: 2, cardCount: 0, monetaryAmount: 0 },
      { id: "c3", title: "Veio", position: 3, cardCount: 0, monetaryAmount: 0 },
      { id: "c4", title: "Contratou", position: 4, cardCount: 0, monetaryAmount: 0 },
    ];
    const r = buildLiveFunnel(
      painel,
      [
        card("a", "c2"), // agendado
        card("b", "c3"), // compareceu (não fechou)
        card("c", "c4", 900), // fechou (⊂ compareceu ⊂ agendado)
      ],
      { scheduledStepIds: ["c2"], attendedStepIds: ["c3"], closingStepIds: ["c4"] },
    );
    expect(r.scheduled).toBe(3); // c2 + c3 + c4 (hierarquia de subconjuntos)
    expect(r.attended).toBe(2); // c3 + c4
    expect(r.closed).toBe(1);
    expect(r.revenue).toBe(900);
  });

  it("fallback canônico: no-show = Faltosos, não agendou = Não Agendados", () => {
    const r = buildLiveFunnel(steps, [
      card("a", "s3"), // Não Agendados
      card("b", "s6"), // Faltosos
      card("c", "s2"), // Agendados
    ]);
    expect(r.noShow).toBe(1);
    expect(r.notScheduled).toBe(1);
    expect(r.scheduled).toBe(2); // Faltosos + Agendados; Não Agendados fora
  });

  it("sem mapping cai no comportamento canônico por título", () => {
    // mesmos steps canônicos: passar mapping=null preserva a classificação antiga
    const cards = [card("a", "s1"), card("b", "s2"), card("c", "s9", 1000)];
    const canonical = buildLiveFunnel(steps, cards);
    const explicitNull = buildLiveFunnel(steps, cards, null);
    expect(explicitNull).toEqual(canonical);
    expect(canonical.scheduled).toBe(2); // s2 (Agendados) + s9 (Compareceram e Fecharam)
    expect(canonical.revenue).toBe(1000);
  });
});

describe("buildDailyFunnel", () => {
  const today = new Date("2026-06-15T12:00:00Z");

  it("bucketiza por dia e preenche até hoje no mês corrente", () => {
    const points = buildDailyFunnel(
      steps,
      [
        card("a", "s1", null, "2026-06-01T10:00:00Z"),
        card("b", "s2", null, "2026-06-01T14:00:00Z"),
        card("c", "s1", null, "2026-06-03T09:00:00Z"),
      ],
      "2026-06",
      today,
    );
    expect(points).toHaveLength(15); // até o dia 15 (today), não o mês inteiro
    expect(points[0]).toEqual({ day: "2026-06-01", leads: 2, scheduled: 1, rate: 0.5 });
    expect(points[1]).toEqual({ day: "2026-06-02", leads: 0, scheduled: 0, rate: null });
    expect(points[2]).toEqual({ day: "2026-06-03", leads: 1, scheduled: 0, rate: 0 });
  });

  it("mês passado preenche todos os dias do mês", () => {
    const points = buildDailyFunnel(steps, [], "2026-04", today);
    expect(points).toHaveLength(30); // abril tem 30 dias
    expect(points.every((p) => p.rate === null)).toBe(true);
  });

  it("Compareceram e Fecharam conta como agendado no dia em que o card foi criado", () => {
    const points = buildDailyFunnel(
      steps,
      [card("a", "s9", null, "2026-06-05T08:00:00Z")],
      "2026-06",
      today,
    );
    const day5 = points.find((p) => p.day === "2026-06-05");
    expect(day5).toEqual({ day: "2026-06-05", leads: 1, scheduled: 1, rate: 1 });
  });

  it("aplica o mapping por coluna também no diário", () => {
    const custom = [
      { id: "c1", title: "Novo", position: 1, cardCount: 0, monetaryAmount: 0 },
      { id: "c2", title: "Marcado", position: 2, cardCount: 0, monetaryAmount: 0 },
    ];
    const points = buildDailyFunnel(
      custom,
      [
        card("a", "c1", null, "2026-06-05T08:00:00Z"),
        card("b", "c2", null, "2026-06-05T09:00:00Z"),
      ],
      "2026-06",
      today,
      { scheduledStepIds: ["c2"] },
    );
    const day5 = points.find((p) => p.day === "2026-06-05");
    expect(day5).toEqual({ day: "2026-06-05", leads: 2, scheduled: 1, rate: 0.5 });
  });
});
