import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  buildTranscript,
  buildYesterdayDigest,
  parseModelSummary,
  senderLabel,
  type TeamEntry,
  type TranscriptMessage,
} from "../supabase/functions/summarize-groups/summarize";

const team = new Map<string, TeamEntry>([
  ["249830328770713", { lid: "249830328770713", name: "Gabriel (contact.IA)", kind: "human" }],
  ["192698657034273", { lid: "192698657034273", name: "Bot contact.IA", kind: "bot" }],
]);

function msg(over: Partial<TranscriptMessage>): TranscriptMessage {
  return {
    event_ts: "2026-07-01T14:30:00.000Z",
    participant: "111122223333",
    push_name: null,
    from_me: false,
    text: "olá",
    ...over,
  };
}

describe("senderLabel", () => {
  it("resolve equipe e bot pelo lid cadastrado", () => {
    expect(senderLabel(msg({ participant: "249830328770713" }), team)).toBe(
      "Gabriel (contact.IA) [equipe]",
    );
    expect(senderLabel(msg({ participant: "192698657034273" }), team)).toBe(
      "Bot (Bot contact.IA)",
    );
  });

  it("usa push_name quando não é numérico, senão marca como cliente", () => {
    expect(senderLabel(msg({ push_name: "Luana - Yamar" }), team)).toBe("Luana - Yamar");
    expect(senderLabel(msg({ participant: "99887766", push_name: "99887766" }), team)).toBe(
      "Cliente (…7766)",
    );
  });

  it("conta conectada (from_me/Você) é equipe", () => {
    expect(senderLabel(msg({ from_me: true }), team)).toBe("Equipe (conta conectada)");
    expect(senderLabel(msg({ participant: "Você" }), team)).toBe("Equipe (conta conectada)");
  });
});

describe("buildTranscript", () => {
  it("gera linhas [HH:MM] Nome: texto no fuso de SP e ignora msg sem texto", () => {
    const { transcript, used } = buildTranscript(
      [
        msg({ text: "Paciente confirmou às 15h", participant: "249830328770713" }),
        msg({ text: null }),
        msg({ text: "obrigada!", push_name: "Recepção Yamar" }),
      ],
      team,
    );
    expect(used).toBe(2);
    // 14:30 UTC = 11:30 em SP
    expect(transcript).toContain("[11:30] Gabriel (contact.IA) [equipe]: Paciente confirmou às 15h");
    expect(transcript).toContain("[11:30] Recepção Yamar: obrigada!");
  });

  it("corta no limite de caracteres", () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      msg({ text: "x".repeat(500) + i }),
    );
    const { used } = buildTranscript(many, team);
    expect(used).toBeLessThan(100);
    expect(used).toBeGreaterThan(0);
  });
});

describe("parseModelSummary", () => {
  const good = {
    resumo_md: "Dia tranquilo, 3 agendamentos confirmados.",
    temas: ["agendamentos"],
    pendencias: [],
    reclamacoes: [],
    sentimento: "positivo",
    risco_churn: false,
  };

  it("aceita JSON puro e com cerca ```json", () => {
    expect(parseModelSummary(JSON.stringify(good))?.resumo_md).toBe(good.resumo_md);
    const fenced = "```json\n" + JSON.stringify(good) + "\n```";
    expect(parseModelSummary(fenced)?.highlights.sentimento).toBe("positivo");
  });

  it("normaliza campos ausentes/inválidos", () => {
    const parsed = parseModelSummary(
      JSON.stringify({ resumo_md: "ok", sentimento: "eufórico", risco_churn: "sim" }),
    );
    expect(parsed?.highlights.sentimento).toBe("neutro");
    expect(parsed?.highlights.risco_churn).toBe(false);
    expect(parsed?.highlights.severidade).toBe("baixa");
    expect(parsed?.highlights.continuidade).toBeNull();
    expect(parsed?.highlights.temas).toEqual([]);
  });

  it("lê severidade e continuidade quando o modelo retorna", () => {
    const parsed = parseModelSummary(
      JSON.stringify({ resumo_md: "ok", severidade: "alta", continuidade: "3º dia com atraso" }),
    );
    expect(parsed?.highlights.severidade).toBe("alta");
    expect(parsed?.highlights.risco_churn).toBe(true);
    expect(parsed?.highlights.continuidade).toBe("3º dia com atraso");
  });

  it("deriva severidade 'alta' de risco_churn quando o modelo não manda severidade (compat)", () => {
    const parsed = parseModelSummary(JSON.stringify({ resumo_md: "ok", risco_churn: true }));
    expect(parsed?.highlights.severidade).toBe("alta");
  });

  it("rejeita resposta sem resumo ou não-JSON", () => {
    expect(parseModelSummary("não sei resumir")).toBeNull();
    expect(parseModelSummary(JSON.stringify({ temas: [] }))).toBeNull();
  });

  it("valida o formato do prompt", () => {
    const p = buildPrompt("Yamar", "01/07/2026", "[10:00] A: oi");
    expect(p).toContain('clínica "Yamar"');
    expect(p).toContain("resumo_md");
    expect(p).toContain("severidade");
    expect(p).toContain("CONVERSA:");
  });

  it("inclui o digest de ontem no prompt quando fornecido", () => {
    const digest = buildYesterdayDigest({ sentimento: "negativo", pendencias: ["retorno do financeiro"] });
    const p = buildPrompt("Yamar", "01/07/2026", "[10:00] A: oi", digest);
    expect(p).toContain("RESUMO DE ONTEM");
    expect(p).toContain("retorno do financeiro");
  });
});

describe("buildYesterdayDigest", () => {
  it("retorna string vazia quando não há resumo de ontem", () => {
    expect(buildYesterdayDigest(null)).toBe("");
    expect(buildYesterdayDigest(undefined)).toBe("");
    expect(buildYesterdayDigest({})).toBe("");
  });
});
