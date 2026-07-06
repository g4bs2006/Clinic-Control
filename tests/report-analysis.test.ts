import { describe, it, expect } from "vitest";
import {
  classifySender,
  detectStage,
  detectE5Substage,
  stopReason,
  analyzeConversation,
  dedupeByContact,
  buildStats,
  type RawMessage,
  type RawSession,
  type ConversationRow,
} from "@/lib/reports/analysis";
import { DEFAULT_KEYWORDS as KW } from "@/lib/reports/keywords";

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

// ── Helpers de fixture ───────────────────────────────────────────────────────

function msgPaciente(text: string): RawMessage {
  return { direction: "FROM_HUB", text, userId: null };
}
function msgIa(text: string): RawMessage {
  return { direction: "TO_HUB", text, userId: null };
}
function msgHumano(text: string, userId = "3f2a9b1c-1111-2222-3333-444455556666"): RawMessage {
  return { direction: "TO_HUB", text, userId };
}
function msgSistema(text = "TRACK"): RawMessage {
  return { direction: "TO_HUB", text, userId: NULL_UUID };
}
function session(overrides: Partial<RawSession> = {}): RawSession {
  return { id: "sess-1", contactId: "contact-1", createdAt: "2026-06-10T12:00:00Z", status: "COMPLETED", ...overrides };
}

function analyze(messages: RawMessage[], opts: { agendou?: boolean; sess?: Partial<RawSession> } = {}) {
  return analyzeConversation(
    {
      session: session(opts.sess),
      messages,
      contact: { name: "Maria", phoneNumber: "+5579999990000" },
      canalNome: "WhatsApp",
      agendouNoCrm: opts.agendou ?? false,
    },
    KW,
  );
}

// ── classifySender ───────────────────────────────────────────────────────────

describe("classifySender", () => {
  it("FROM_HUB é paciente", () => {
    expect(classifySender(msgPaciente("oi")).categoria).toBe("PACIENTE");
  });
  it("TO_HUB sem userId é IA", () => {
    expect(classifySender(msgIa("olá!")).categoria).toBe("IA");
  });
  it("TO_HUB com NULL_UUID é sistema", () => {
    expect(classifySender(msgSistema()).categoria).toBe("SISTEMA");
  });
  it("TO_HUB com userId real é humano, nome via padrão *Nome:*", () => {
    const r = classifySender(msgHumano("*Débora:*\nBom dia!"));
    expect(r.categoria).toBe("HUMANO");
    expect(r.nome).toBe("Débora");
  });
  it("humano sem nome cai no prefixo do userId", () => {
    const r = classifySender(msgHumano("sem assinatura"));
    expect(r.categoria).toBe("HUMANO");
    expect(r.nome).toBe("3f2a9b1c");
  });
});

// ── detectStage ──────────────────────────────────────────────────────────────

describe("detectStage", () => {
  const base = { nIa: 1, nHum: 0 };
  it("E6 tem precedência máxima", () => {
    const r = detectStage({ ...base, textoIa: "a clínica agradece, até logo", textoAll: "" }, KW);
    expect(r.cod).toBe("E6");
  });
  it("keyword de agendamento leva a E5, mas não marca agendou (só CRM)", () => {
    const r = detectStage(
      { ...base, textoIa: "", textoAll: "agendamento confirmado com sucesso" },
      KW,
    );
    expect(r.cod).toBe("E5");
  });
  it("IA mostrando vagas é E5", () => {
    const r = detectStage(
      { ...base, textoIa: "separei as duas melhores opções: opção 1 às 9h", textoAll: "" },
      KW,
    );
    expect(r.cod).toBe("E5");
  });
  it("investigação SPIN é E2", () => {
    const r = detectStage({ ...base, textoIa: "o que mais te incomoda hoje?", textoAll: "" }, KW);
    expect(r.cod).toBe("E2");
  });
  it("humano presente sem keyword de estágio é transbordo E7", () => {
    const r = detectStage({ nIa: 0, nHum: 2, textoIa: "xpto", textoAll: "" }, KW);
    expect(r.cod).toBe("E7");
    expect(r.transbordo).toBe(true);
  });
  it("IA respondeu sem keyword é E1; sem resposta é E0", () => {
    expect(detectStage({ nIa: 1, nHum: 0, textoIa: "xpto", textoAll: "" }, KW).cod).toBe("E1");
    expect(detectStage({ nIa: 0, nHum: 0, textoIa: "", textoAll: "" }, KW).cod).toBe("E0");
  });
});

// ── detectE5Substage ─────────────────────────────────────────────────────────

describe("detectE5Substage", () => {
  it("agendou com tag AGENDOU → E5.5", () => {
    const r = detectE5Substage(
      { textoAll: "", agendou: true, habilidades: ["AGENDOU"] },
      KW,
    );
    expect(r.cod).toBe("E5.5");
  });
  it("agendou sem tag → E5.4", () => {
    expect(detectE5Substage({ textoAll: "", agendou: true, habilidades: [] }, KW).cod).toBe("E5.4");
  });
  it("validando dados sem confirmar → E5.3", () => {
    const r = detectE5Substage(
      { textoAll: "estou realizando o agendamento, um momento", agendou: false, habilidades: [] },
      KW,
    );
    expect(r.cod).toBe("E5.3");
  });
  it("pediu dados → E5.2; só mostrou vagas → E5.1", () => {
    expect(
      detectE5Substage({ textoAll: "me envia seu nome completo e cpf", agendou: false, habilidades: [] }, KW).cod,
    ).toBe("E5.2");
    expect(
      detectE5Substage({ textoAll: "qual fica melhor?", agendou: false, habilidades: [] }, KW).cod,
    ).toBe("E5.1");
  });
});

// ── analyzeConversation ──────────────────────────────────────────────────────

describe("analyzeConversation", () => {
  it("conversa IA que agendou (CRM) chega a E5.5 com habilidades inferidas", () => {
    const row = analyze(
      [
        msgPaciente("oi, queria uma avaliação"),
        msgIa("olá! o que mais te incomoda?"),
        msgPaciente("dente quebrado"),
        msgIa("separei as duas melhores opções: opção 1 amanhã 9h"),
        msgPaciente("pode ser amanhã"),
        msgIa("agendamento confirmado, te esperamos!"),
      ],
      { agendou: true },
    );
    expect(row.agendou).toBe(true);
    expect(row.estagioCod).toBe("E5.5");
    expect(row.tipoAtendimento).toBe("IA Autônoma");
    expect(row.habilidades).toContain("realizar_agendamento");
    expect(row.motivoParada).toBe("Agendamento confirmado pela IA");
  });

  it("keyword de 'agendou' SEM card no CRM não vira agendamento (falso positivo)", () => {
    const row = analyze([
      msgPaciente("oi"),
      msgIa("agendamento confirmado, te esperamos!"),
    ]);
    expect(row.agendou).toBe(false);
    expect(row.estagioCod.startsWith("E5")).toBe(true);
  });

  it("CRM confirma agendamento em conversa que parou cedo → promove para E5", () => {
    const row = analyze([msgPaciente("oi"), msgIa("olá, tudo bem?")], { agendou: true });
    expect(row.agendou).toBe(true);
    expect(row.estagioCod.startsWith("E5")).toBe(true);
  });

  it("humano assumiu → tipo Misto e nome capturado", () => {
    const row = analyze([
      msgPaciente("oi"),
      msgIa("olá!"),
      msgHumano("*Débora:*\nvou te ajudar por aqui"),
    ]);
    expect(row.tipoAtendimento).toBe("Misto (IA + Humano)");
    expect(row.humanos).toEqual(["Débora"]);
    expect(row.transbordo).toBe(true);
  });

  it("lead sem resposta → E0/E1 com motivo de não engajamento", () => {
    const row = analyze([msgIa("olá, tudo bem?")]);
    expect(row.msgsPaciente).toBe(0);
    expect(row.motivoParada).toBe("Lead nunca respondeu — sem engajamento");
  });

  it("mensagens de sistema não contam como IA nem humano", () => {
    const row = analyze([msgSistema(), msgPaciente("oi"), msgIa("olá")]);
    expect(row.msgsSistema).toBe(1);
    expect(row.msgsIa).toBe(1);
    expect(row.tipoAtendimento).toBe("IA Autônoma");
  });
});

// ── stopReason / dedupe / stats ──────────────────────────────────────────────

describe("stopReason", () => {
  it("objeção do paciente tem precedência sobre o estágio", () => {
    expect(
      stopReason({ cod: "E4", nPac: 3, textoPac: "achei muito caro", agendou: false }),
    ).toBe("Lead demonstrou objeção (preço / tempo)");
  });
  it("sub-estágio E5.x usa a mensagem do E5", () => {
    expect(stopReason({ cod: "E5.1", nPac: 2, textoPac: "ok", agendou: false })).toBe(
      "IA apresentou horários mas lead não confirmou",
    );
  });
});

describe("dedupeByContact", () => {
  function row(over: Partial<ConversationRow>): ConversationRow {
    return {
      sessionId: "s", contactId: "c1", contato: "Maria", telefone: "79 9",
      canal: "", status: "", criadoEm: "2026-06-01T00:00:00Z",
      tipoAtendimento: "IA Autônoma", humanos: [], estagioLabel: "", estagioCod: "E1",
      agendou: false, transbordo: false, melhoria: false, etiquetas: [], habilidades: [],
      motivoParada: "", utmSource: "", utmCampaign: "", msgsPaciente: 1, msgsIa: 1,
      msgsSistema: 0, msgsHumano: 0, totalMsgs: 2, resumoPaciente: "", ultimaMsgIa: "",
      ...over,
    };
  }
  it("mantém a conversa mais avançada do mesmo contato", () => {
    const out = dedupeByContact([
      row({ sessionId: "a", estagioCod: "E2" }),
      row({ sessionId: "b", estagioCod: "E5.4", agendou: true }),
      row({ sessionId: "c", estagioCod: "E1" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sessionId).toBe("b");
  });
  it("contatos diferentes não colidem; sem contato usa telefone e por fim a sessão", () => {
    const out = dedupeByContact([
      row({ sessionId: "a", contactId: "c1" }),
      row({ sessionId: "b", contactId: "c2" }),
      row({ sessionId: "d", contactId: "", telefone: "" }),
      row({ sessionId: "e", contactId: "", telefone: "" }),
    ]);
    expect(out).toHaveLength(4);
  });
});

describe("buildStats", () => {
  it("agrega funil, taxa e motivos", () => {
    const mk = (cod: string, agendou = false, msgsPaciente = 1) =>
      ({
        sessionId: cod + Math.random(), contactId: "", contato: "", telefone: "",
        canal: "", status: "", criadoEm: "", tipoAtendimento: "IA Autônoma" as const,
        humanos: [], estagioLabel: `${cod} - x`, estagioCod: cod, agendou,
        transbordo: false, melhoria: false, etiquetas: [], habilidades: [],
        motivoParada: agendou ? "ok" : "Lead parou", utmSource: "", utmCampaign: "",
        msgsPaciente, msgsIa: 1, msgsSistema: 0, msgsHumano: 0, totalMsgs: 2,
        resumoPaciente: "", ultimaMsgIa: "",
      });
    const stats = buildStats([
      mk("E1", false, 0),
      mk("E2"),
      mk("E5.4", true),
      mk("E5.5", true),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.agendamentos).toBe(2);
    expect(stats.taxaConversao).toBe(0.5);
    expect(stats.semResposta).toBe(1);
    expect(stats.taxaEngajamento).toBe(0.75);
    expect(stats.funil.map((f) => f.cod)).toEqual(["E1", "E2", "E5.4", "E5.5"]);
    expect(stats.motivosParada[0]).toEqual({ motivo: "Lead parou", count: 2 });
  });
});
