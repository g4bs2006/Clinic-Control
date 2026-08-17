import { describe, it, expect } from "vitest";
import {
  extractGroups,
  extractPagesCount,
  extractText,
  normalizeMessages,
  orderGroupsForRun,
  pageRangeToFetch,
} from "../supabase/functions/collect-groups/normalize";

describe("extractGroups", () => {
  it("pega só grupos @g.us do envelope { success, data: [...] }", () => {
    const payload = {
      success: true,
      data: [
        { id: "120363423863461716@g.us", subject: "Contact I.a" },
        { id: "120363425708905238@g.us", subject: "Volte a Sorrir & contact.IA" },
        { id: "5511999@s.whatsapp.net", subject: "não é grupo" },
        { naoTemId: true },
      ],
    };
    const groups = extractGroups(payload, "CONTAC.IA");
    expect(groups).toEqual([
      { group_jid: "120363423863461716@g.us", name: "Contact I.a", instance: "CONTAC.IA" },
      { group_jid: "120363425708905238@g.us", name: "Volte a Sorrir & contact.IA", instance: "CONTAC.IA" },
    ]);
  });
});

// Amostra fiel do retorno real do find-messages (recortada).
const messagesPayload = {
  success: true,
  data: {
    messages: {
      total: 3,
      records: [
        {
          key: { id: "A1", fromMe: false, remoteJid: "120363423863461716@g.us" },
          pushName: "34278771552312",
          messageType: "conversation",
          message: { conversation: "Bom dia! Paciente confirmou?" },
          messageTimestamp: 1771533902,
        },
        {
          key: { id: "A2", fromMe: false, remoteJid: "120363423863461716@g.us" },
          pushName: "36426406207491",
          messageType: "conversation",
          messageTimestamp: 1771533837,
        },
        {
          // sem id → deve ser ignorada
          key: { fromMe: false, remoteJid: "120363423863461716@g.us" },
          pushName: "x",
          messageTimestamp: 1771533800,
        },
      ],
    },
  },
};

describe("extractPagesCount", () => {
  it("lê pages com e sem envelope data", () => {
    expect(extractPagesCount({ messages: { total: 2206, pages: 3, records: [] } })).toBe(3);
    expect(extractPagesCount({ data: { messages: { pages: 2, records: [] } } })).toBe(2);
  });

  it("default 1 quando ausente/inválido", () => {
    expect(extractPagesCount({})).toBe(1);
    expect(extractPagesCount(null)).toBe(1);
    expect(extractPagesCount({ messages: { pages: 0 } })).toBe(1);
    expect(extractPagesCount({ messages: { pages: "x" } })).toBe(1);
  });
});

describe("pageRangeToFetch", () => {
  it("sem checkpoint (grupo novo): varre do zero, limitado ao teto por execução", () => {
    expect(pageRangeToFetch(100, 0, 40, 2)).toEqual({ start: 2, end: 41 });
    expect(pageRangeToFetch(5, 0, 40, 2)).toEqual({ start: 2, end: 5 });
  });

  it("com checkpoint: só as páginas novas, com overlap", () => {
    // sincronizado até a página 38 → refaz 37-38 (overlap 2) e avança até o total
    expect(pageRangeToFetch(45, 38, 40, 2)).toEqual({ start: 37, end: 45 });
  });

  it("checkpoint desatualizado + total bem maior: catch-up limitado por execução, não tudo de uma vez", () => {
    // total real cresceu p/ 500 enquanto o teto antigo truncava em ~40; mesmo
    // assim, essa execução só avança 40 páginas a partir do checkpoint — o
    // resto fica pra próxima execução (senão volta a dar timeout).
    expect(pageRangeToFetch(500, 38, 40, 2)).toEqual({ start: 37, end: 76 });
  });

  it("checkpoint além do total (grupo encolheu): intervalo vazio, chamador não itera", () => {
    const { start, end } = pageRangeToFetch(38, 50, 40, 2);
    expect(start).toBeGreaterThan(end);
  });

  it("overlap sempre refaz as últimas páginas conhecidas, mesmo já sincronizado", () => {
    expect(pageRangeToFetch(38, 38, 40, 2)).toEqual({ start: 37, end: 38 });
  });

  it("checkpoint não deixa start menor que 2 (página 1 já foi lida antes)", () => {
    expect(pageRangeToFetch(3, 1, 40, 2)).toEqual({ start: 2, end: 3 });
  });
});

describe("orderGroupsForRun", () => {
  const jid = (g: { group_jid: string }) => g.group_jid;

  it("grupos mapeados a clínica vêm antes dos não mapeados", () => {
    const out = orderGroupsForRun([
      { group_jid: "sem", clinic_id: null, last_collected_at: null },
      { group_jid: "com", clinic_id: "c1", last_collected_at: "2026-08-17T00:00:00Z" },
    ]);
    // o mapeado vem primeiro mesmo tendo sido coletado mais recentemente
    expect(out.map(jid)).toEqual(["com", "sem"]);
  });

  it("dentro do mesmo grupo, o menos recentemente coletado vem primeiro", () => {
    const out = orderGroupsForRun([
      { group_jid: "novo", clinic_id: "c", last_collected_at: "2026-08-17T10:00:00Z" },
      { group_jid: "antigo", clinic_id: "c", last_collected_at: "2026-08-15T10:00:00Z" },
      { group_jid: "meio", clinic_id: "c", last_collected_at: "2026-08-16T10:00:00Z" },
    ]);
    expect(out.map(jid)).toEqual(["antigo", "meio", "novo"]);
  });

  it("nunca coletado (null) tem prioridade sobre qualquer já coletado", () => {
    const out = orderGroupsForRun([
      { group_jid: "ja", clinic_id: "c", last_collected_at: "2020-01-01T00:00:00Z" },
      { group_jid: "nunca", clinic_id: "c", last_collected_at: null },
    ]);
    expect(out.map(jid)).toEqual(["nunca", "ja"]);
  });

  it("não muta o array recebido", () => {
    const input = [
      { group_jid: "b", clinic_id: null, last_collected_at: null },
      { group_jid: "a", clinic_id: "c", last_collected_at: null },
    ];
    orderGroupsForRun(input);
    expect(input.map(jid)).toEqual(["b", "a"]);
  });
});

describe("normalizeMessages", () => {
  it("mapeia records e usa pushName como remetente (sem key.participant)", () => {
    const rows = normalizeMessages(messagesPayload, "CONTAC.IA", 0);
    expect(rows).toHaveLength(2); // a 3ª (sem id) é descartada
    expect(rows[0]).toMatchObject({
      group_jid: "120363423863461716@g.us",
      message_id: "A1",
      from_me: false,
      participant: "34278771552312",
      push_name: "34278771552312",
      message_type: "conversation",
      text: "Bom dia! Paciente confirmou?",
      instance: "CONTAC.IA",
      clinic_id: null,
    });
    expect(rows[0].event_ts).toBe(new Date(1771533902 * 1000).toISOString());
    expect(rows[1].text).toBeNull(); // A2 não tem message → sem texto
  });

  it("prefere key.participant quando presente (strip do @lid)", () => {
    const p = {
      data: { messages: { records: [
        { key: { id: "B1", fromMe: false, remoteJid: "1@g.us", participant: "5531999@s.whatsapp.net" }, pushName: "Fulano", messageTimestamp: 1771533902 },
      ] } },
    };
    expect(normalizeMessages(p, "I", 0)[0].participant).toBe("5531999");
  });

  it("extractText cobre conversa, texto estendido, legendas e limite", () => {
    expect(extractText({ conversation: "oi" })).toBe("oi");
    expect(extractText({ extendedTextMessage: { text: "resposta citada" } })).toBe("resposta citada");
    expect(extractText({ imageMessage: { caption: "segue o print" } })).toBe("segue o print");
    expect(extractText({ videoMessage: { caption: "vídeo da recepção" } })).toBe("vídeo da recepção");
    expect(extractText({ documentMessage: { caption: "contrato.pdf" } })).toBe("contrato.pdf");
    expect(extractText({ audioMessage: {} })).toBeNull(); // mídia sem legenda
    expect(extractText({ conversation: "   " })).toBeNull();
    expect(extractText(undefined)).toBeNull();
    expect(extractText({ conversation: "x".repeat(5000) })).toHaveLength(4000);
  });

  it("lookbackHours corta mensagens mais antigas que a janela", () => {
    // now fixo logo após a msg A1; janela de 1h deve manter só as recentes
    const now = 1771533902 * 1000 + 60_000; // 1 min depois de A1
    const rows = normalizeMessages(messagesPayload, "I", 1, now);
    // A1 (agora-1min) e A2 (agora-~2min) estão dentro de 1h → 2 linhas
    expect(rows).toHaveLength(2);
    // com janela de 0.0001h (~0.36s), nada sobra
    expect(normalizeMessages(messagesPayload, "I", 0.0001, now)).toHaveLength(0);
  });
});
