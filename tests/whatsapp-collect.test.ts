import { describe, it, expect } from "vitest";
import {
  extractGroups,
  normalizeMessages,
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
      instance: "CONTAC.IA",
      clinic_id: null,
    });
    expect(rows[0].event_ts).toBe(new Date(1771533902 * 1000).toISOString());
  });

  it("prefere key.participant quando presente (strip do @lid)", () => {
    const p = {
      data: { messages: { records: [
        { key: { id: "B1", fromMe: false, remoteJid: "1@g.us", participant: "5531999@s.whatsapp.net" }, pushName: "Fulano", messageTimestamp: 1771533902 },
      ] } },
    };
    expect(normalizeMessages(p, "I", 0)[0].participant).toBe("5531999");
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
