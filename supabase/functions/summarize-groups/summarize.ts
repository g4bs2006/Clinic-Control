// Lógica pura do resumo diário — testável no vitest, sem globals de Deno.

export interface TranscriptMessage {
  event_ts: string;
  participant: string | null;
  push_name: string | null;
  from_me: boolean;
  text: string | null;
}

export interface TeamEntry {
  lid: string;
  name: string | null;
  kind: "human" | "bot";
}

export type Severidade = "baixa" | "media" | "alta";

export interface SummaryTask {
  acao: string;
  motivo: string | null;
  tipo: "acao" | "acompanhamento";
}

export interface SummaryHighlights {
  temas: string[];
  pendencias: string[];
  reclamacoes: string[];
  tarefas: SummaryTask[];
  sentimento: "positivo" | "neutro" | "negativo";
  risco_churn: boolean;
  severidade: Severidade;
  continuidade: string | null;
}

/** Resumo do dia anterior, para o modelo notar continuidade de problemas. */
export interface YesterdayDigest {
  sentimento?: SummaryHighlights["sentimento"];
  temas?: string[];
  pendencias?: string[];
  reclamacoes?: string[];
}

export interface ModelSummary {
  resumo_md: string;
  highlights: SummaryHighlights;
}

const MAX_TRANSCRIPT_CHARS = 30_000;

/** Nome exibível de um remetente: equipe/bot pelo cadastro, senão push_name. */
export function senderLabel(
  msg: Pick<TranscriptMessage, "participant" | "push_name" | "from_me">,
  teamByLid: Map<string, TeamEntry>,
): string {
  if (msg.from_me || msg.participant === "Você") return "Equipe (conta conectada)";
  const entry = msg.participant ? teamByLid.get(msg.participant) : undefined;
  if (entry) return entry.kind === "bot" ? `Bot (${entry.name ?? "IA"})` : `${entry.name ?? "Equipe"} [equipe]`;
  const pn = msg.push_name;
  if (pn && !/^\d+$/.test(pn)) return pn;
  const id = msg.participant ?? "?";
  return `Cliente (…${id.slice(-4)})`;
}

/** Transcript "[HH:MM] Nome: texto" (fuso SP), limitado para caber no prompt. */
export function buildTranscript(
  messages: TranscriptMessage[],
  teamByLid: Map<string, TeamEntry>,
): { transcript: string; used: number } {
  const lines: string[] = [];
  let total = 0;
  let used = 0;
  for (const m of messages) {
    if (!m.text) continue;
    const hhmm = new Date(m.event_ts).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const line = `[${hhmm}] ${senderLabel(m, teamByLid)}: ${m.text}`;
    if (total + line.length > MAX_TRANSCRIPT_CHARS) break;
    lines.push(line);
    total += line.length + 1;
    used++;
  }
  return { transcript: lines.join("\n"), used };
}

/** Digest curto do dia anterior para dar contexto de continuidade ao modelo. */
export function buildYesterdayDigest(y: YesterdayDigest | null | undefined): string {
  if (!y) return "";
  const parts: string[] = [];
  if (y.sentimento) parts.push(`sentimento ${y.sentimento}`);
  if (y.pendencias?.length) parts.push(`pendências: ${y.pendencias.join("; ")}`);
  if (y.reclamacoes?.length) parts.push(`reclamações: ${y.reclamacoes.join("; ")}`);
  if (y.temas?.length) parts.push(`temas: ${y.temas.join("; ")}`);
  return parts.length ? `RESUMO DE ONTEM (contexto, não repita literalmente): ${parts.join(" | ")}` : "";
}

export function buildPrompt(
  clinicName: string,
  dateLabel: string,
  transcript: string,
  yesterdayDigest?: string,
): string {
  return [
    `Você é um analista de sucesso do cliente da Contact.IA, empresa que presta serviço de agendamento por IA para clínicas odontológicas.`,
    `Abaixo está a conversa de ${dateLabel} no grupo de WhatsApp entre a equipe da Contact.IA e a clínica "${clinicName}".`,
    `Mensagens marcadas com [equipe] ou "Bot" são do nosso lado; as demais são de pessoas da clínica (cliente).`,
    ``,
    ...(yesterdayDigest ? [yesterdayDigest, ``] : []),
    `Resuma objetivamente o que aconteceu no dia. Responda APENAS com JSON válido neste formato:`,
    `{`,
    `  "resumo_md": "resumo do dia em markdown, 3 a 8 linhas, em português",`,
    `  "temas": ["tema 1", "tema 2"],`,
    `  "pendencias": ["pontos que ficaram em aberto no dia, de forma resumida"],`,
    `  "reclamacoes": ["reclamações ou insatisfações do cliente, se houver"],`,
    `  "tarefas": [{ "acao": "o que fazer, começando com verbo no infinitivo e específico (ex.: 'Reenviar o link de agendamento configurado')", "motivo": "1 frase de contexto do porquê, SÓ quando ajudar a entender; senão null", "tipo": "acao ou acompanhamento" }],`,
    `  "sentimento": "positivo" | "neutro" | "negativo",`,
    `  "severidade": "baixa" | "media" | "alta",`,
    `  "continuidade": "nota curta se algo do resumo de ontem persiste ou se agravou hoje, senão null"`,
    `}`,
    ``,
    `Em "tarefas", liste tudo que gera trabalho para a NOSSA equipe (Contact.IA), sendo abrangente (inclua itens pequenos). Use "tipo": "acao" para algo concreto a executar; "acompanhamento" para itens de só ficar de olho/aguardar/monitorar, sem ação imediata. Inclua um item para dar retorno sobre CADA reclamação do cliente. Não inclua o que depende apenas do cliente nem o que já foi resolvido no próprio dia. "motivo" só quando agregar contexto, senão null.`,
    ``,
    `"severidade" = "alta" apenas se houver sinal claro de insatisfação grave, ameaça de cancelamento ou frustração recorrente; "media" para atrito pontual relevante; "baixa" no dia a dia normal.`,
    ``,
    `CONVERSA:`,
    transcript,
  ].join("\n");
}

/** Interpreta a resposta do modelo (JSON puro ou cercado por ```json). */
export function parseModelSummary(raw: string): ModelSummary | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const j = JSON.parse(cleaned) as Record<string, unknown>;
    const resumo = typeof j.resumo_md === "string" ? j.resumo_md.trim() : "";
    if (!resumo) return null;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const tarefas: SummaryTask[] = Array.isArray(j.tarefas)
      ? (j.tarefas as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .filter((t) => typeof t.acao === "string" && (t.acao as string).trim().length > 0)
          .map((t) => ({
            acao: (t.acao as string).trim(),
            motivo:
              typeof t.motivo === "string" && t.motivo.trim() ? t.motivo.trim() : null,
            tipo: t.tipo === "acompanhamento" ? ("acompanhamento" as const) : ("acao" as const),
          }))
      : [];
    const sentimento =
      j.sentimento === "positivo" || j.sentimento === "negativo" ? j.sentimento : "neutro";
    const severidade: Severidade =
      j.severidade === "alta" || j.severidade === "media" || j.severidade === "baixa"
        ? j.severidade
        : j.risco_churn === true
          ? "alta"
          : "baixa";
    const continuidade = typeof j.continuidade === "string" && j.continuidade.trim() ? j.continuidade.trim() : null;
    return {
      resumo_md: resumo,
      highlights: {
        temas: arr(j.temas),
        pendencias: arr(j.pendencias),
        reclamacoes: arr(j.reclamacoes),
        tarefas,
        sentimento,
        risco_churn: severidade === "alta",
        severidade,
        continuidade,
      },
    };
  } catch {
    return null;
  }
}
