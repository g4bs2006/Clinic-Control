// Análise de conversas WTS/Helena — porta 1:1 do framework Python
// (Colt_analise_relatorio_junho.py). Funções puras: recebem os dados brutos e
// as keywords; nada aqui toca API ou banco.
import type { ReportKeywords } from "./keywords";

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

// ── Tipos dos payloads crus da API WTS (campos usados na análise) ───────────
export type RawMessage = {
  direction?: string | null;
  userId?: string | null;
  type?: string | null;
  text?: string | null;
  createdAt?: string | null;
  status?: string | null;
  userName?: string | null;
  agentName?: string | null;
  operatorName?: string | null;
  user?: { name?: string | null } | null;
  operator?: { name?: string | null } | null;
};

export type RawSession = {
  id: string;
  contactId?: string | null;
  channelId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  endAt?: string | null;
  utm?: { source?: string | null; campaign?: string | null } | null;
  tags?: { name?: string | null; label?: string | null }[] | null;
};

export type RawContact = {
  name?: string | null;
  nameWhatsapp?: string | null;
  phoneNumber?: string | null;
  phoneNumberFormatted?: string | null;
  tags?: { name?: string | null; label?: string | null }[] | null;
};

export type SenderCategory = "PACIENTE" | "IA" | "SISTEMA" | "HUMANO";

export type ConversationRow = {
  sessionId: string;
  contactId: string;
  contato: string;
  telefone: string;
  canal: string;
  status: string;
  criadoEm: string; // ISO
  tipoAtendimento: "IA Autônoma" | "Humano (Exclusivo)" | "Misto (IA + Humano)";
  humanos: string[];
  estagioLabel: string;
  estagioCod: string;
  agendou: boolean;
  transbordo: boolean;
  melhoria: boolean;
  etiquetas: string[];
  habilidades: string[];
  motivoParada: string;
  utmSource: string;
  utmCampaign: string;
  msgsPaciente: number;
  msgsIa: number;
  msgsSistema: number;
  msgsHumano: number;
  totalMsgs: number;
  resumoPaciente: string;
  ultimaMsgIa: string;
};

export function normalizar(t: unknown): string {
  return t ? String(t).toLowerCase().trim() : "";
}

// WTS formata mensagens de operadores como "*Nome:*\nTexto..."
const NOME_TEXTO_RE = /^\*([^*\n]{1,30}):\*/m;

function getMsgUserName(msg: RawMessage): string {
  const direct =
    msg.userName ||
    msg.agentName ||
    msg.operatorName ||
    msg.user?.name ||
    msg.operator?.name ||
    "";
  if (direct) return String(direct).trim();
  const m = NOME_TEXTO_RE.exec(String(msg.text ?? ""));
  if (m) return m[1].trim();
  return "";
}

/**
 * Direção WTS: FROM_HUB = recebida do WhatsApp (paciente → clínica);
 * TO_HUB = enviada pela clínica, onde userId null = IA autônoma,
 * NULL_UUID = evento de sistema e UUID real = operador humano.
 */
export function classifySender(msg: RawMessage): {
  categoria: SenderCategory;
  nome: string;
} {
  const uid = msg.userId ?? "";
  if (msg.direction === "FROM_HUB") return { categoria: "PACIENTE", nome: "" };
  if (uid === NULL_UUID) return { categoria: "SISTEMA", nome: "" };
  if (uid) return { categoria: "HUMANO", nome: getMsgUserName(msg) || uid.slice(0, 8) };
  return { categoria: "IA", nome: "" };
}

export type StageDetection = {
  label: string;
  cod: string;
  transbordo: boolean;
  melhoria: boolean;
};

export function detectStage(
  args: {
    nIa: number;
    nHum: number;
    textoIa: string;
    textoAll: string;
  },
  kw: ReportKeywords,
): StageDetection {
  const ti = normalizar(args.textoIa);
  const ta = normalizar(args.textoAll);
  const transbordo = args.nHum > 0 || kw.E7.some((k) => ti.includes(k));
  const melhoria = kw.E8.some((k) => ti.includes(k));

  if (kw.E6.some((k) => ti.includes(k)))
    return { label: "E6 - Finalização ✓", cod: "E6", transbordo, melhoria };
  // Termos como "agendamento confirmado" levam a conversa ao estágio E5; a
  // classificação do agendamento em si (analyzeConversation) usa a mesma
  // keyword para marcar agendou=true — não há confirmação externa (CRM).
  if (kw.E5_AGENDOU.some((k) => ta.includes(k)))
    return { label: "E5 - Tentou Agendar", cod: "E5", transbordo, melhoria };
  if (kw.E5_TENTOU.some((k) => ti.includes(k)))
    return { label: "E5 - Tentou Agendar", cod: "E5", transbordo, melhoria };
  if (kw.E4.some((k) => ti.includes(k)))
    return { label: "E4 - Necessidade/Desejo", cod: "E4", transbordo, melhoria };
  if (kw.E3.some((k) => ti.includes(k)))
    return { label: "E3 - Problema/Implicação", cod: "E3", transbordo, melhoria };
  if (kw.E2.some((k) => ti.includes(k)))
    return { label: "E2 - Investigação (SPIN)", cod: "E2", transbordo, melhoria };
  if (transbordo) return { label: "E7 - Transbordo", cod: "E7", transbordo, melhoria };
  if (kw.E1.some((k) => ti.includes(k)) || args.nIa > 0)
    return { label: "E1 - Acolhimento", cod: "E1", transbordo, melhoria };
  return { label: "E0 - Sem Resposta IA", cod: "E0", transbordo, melhoria };
}

/**
 * Sub-estágios do fechamento:
 * E5.1 IA mostrou vagas · E5.2 pediu dados · E5.3 dados não confirmados ·
 * E5.4 agendou (sem tag) · E5.5 agendou com tag AGENDOU.
 */
export function detectE5Substage(
  args: { textoAll: string; agendou: boolean; habilidades: string[] },
  kw: ReportKeywords,
): { label: string; cod: string } {
  const tAll = normalizar(args.textoAll);
  const habs = args.habilidades.map(normalizar);
  const temTag = habs.some((h) => h === "agendou" || h === "agendado pela ia");

  if (args.agendou) {
    if (temTag) return { label: "E5.5 - Agendado pela IA / Agendou ✓", cod: "E5.5" };
    return { label: "E5.4 - Agendamento Realizado", cod: "E5.4" };
  }
  if (kw.E5_VALIDANDO.some((k) => tAll.includes(k)))
    return { label: "E5.3 - Dados não confirmados", cod: "E5.3" };
  if (kw.E5_PEDIU_DADOS.some((k) => tAll.includes(k)))
    return { label: "E5.2 - Enviado os dados", cod: "E5.2" };
  return { label: "E5.1 - verificar_disponibilidade", cod: "E5.1" };
}

const OBJECOES = [
  "vou pensar", "tá caro", "ta caro", "muito caro", "sem dinheiro",
  "não posso", "nao posso", "depois", "mais tarde", "agora não",
];

export function stopReason(args: {
  cod: string;
  nPac: number;
  textoPac: string;
  agendou: boolean;
}): string {
  if (args.agendou && args.cod.includes("E6"))
    return "Funil completo — atendimento encerrado com sucesso";
  if (args.agendou) return "Agendamento confirmado pela IA";
  if (args.nPac === 0) return "Lead nunca respondeu — sem engajamento";
  const t = normalizar(args.textoPac);
  if (OBJECOES.some((o) => t.includes(o))) return "Lead demonstrou objeção (preço / tempo)";
  const porEstagio: Record<string, string> = {
    "E5": "IA apresentou horários mas lead não confirmou",
    "E4": "Lead não confirmou compromisso — funil travou antes do fechamento",
    "E3": "Lead parou na implicação — não criou desejo",
    "E2": "Lead parou na investigação — sem identificar dor",
    "E1": "Lead parou após acolhimento — sem mapear dor",
    "E0": "IA não respondeu / falha técnica ou lead fora do escopo",
    "E7": "Conversa transferida para humano",
  };
  // Sub-estágios E5.x caem na mensagem do E5
  const base = args.cod.startsWith("E5") ? "E5" : args.cod;
  return porEstagio[base] ?? "Conversa encerrada sem agendamento";
}

// ── Análise de uma conversa completa ─────────────────────────────────────────

export function analyzeConversation(
  input: {
    session: RawSession;
    messages: RawMessage[];
    contact: RawContact | null;
    canalNome: string;
  },
  kw: ReportKeywords,
): ConversationRow {
  const { session, messages, contact } = input;
  const nome = contact?.name || contact?.nameWhatsapp || "";
  const tel = contact?.phoneNumberFormatted || contact?.phoneNumber || "";

  const tagNames = (tags?: { name?: string | null; label?: string | null }[] | null) =>
    (tags ?? []).map((t) => t.name || t.label || "").filter(Boolean);
  const etiquetas = [...new Set([...tagNames(session.tags), ...tagNames(contact?.tags)])];

  let nPac = 0, nIa = 0, nSys = 0, nHum = 0;
  const txtIa: string[] = [], txtPac: string[] = [], txtAll: string[] = [];
  const humanos: string[] = [];

  for (const m of messages) {
    const { categoria, nome: senderNome } = classifySender(m);
    const txt = m.text ?? "";
    if (categoria === "PACIENTE") { nPac++; txtPac.push(txt); }
    else if (categoria === "IA") { nIa++; txtIa.push(txt); }
    else if (categoria === "SISTEMA") { nSys++; }
    else if (categoria === "HUMANO") {
      nHum++;
      if (senderNome && !humanos.includes(senderNome)) humanos.push(senderNome);
    }
    txtAll.push(txt);
  }

  const tIaAll = txtIa.join(" ");
  const tPacAll = txtPac.join(" ");
  const tAllStr = txtAll.join(" ");

  const detected = detectStage({ nIa, nHum, textoIa: tIaAll, textoAll: tAllStr }, kw);
  let { label: estagioLabel, cod: estagioCod } = detected;
  const { transbordo, melhoria } = detected;

  // Agendamento: detectado por keyword de confirmação no texto da conversa
  // (KW E5_AGENDOU) — não há cruzamento com o CRM nesta versão. Sujeito a
  // falso positivo (ex.: "te esperamos" sem confirmação real); ver aviso na
  // planilha. Se a keyword aparece mas o estágio ficou abaixo de E5, promove
  // (a conversa chegou ao fechamento).
  const agendou = kw.E5_AGENDOU.some((k) => normalizar(tAllStr).includes(k));
  if (agendou && estagioCod !== "E5" && estagioCod !== "E6") {
    estagioCod = "E5";
    estagioLabel = "E5 - Tentou Agendar";
  }

  // Habilidades: a API WTS não expõe eventos de skill — inferidas por texto.
  const habilidades: string[] = [];
  const tipoAtendimento =
    nHum > 0 && nIa > 0
      ? "Misto (IA + Humano)"
      : nHum > 0
        ? "Humano (Exclusivo)"
        : "IA Autônoma";
  if (agendou && tipoAtendimento === "IA Autônoma") {
    habilidades.push("realizar_agendamento", "AGENDOU", "Agendado pela IA");
  } else if (agendou) {
    habilidades.push("realizar_agendamento");
  }
  {
    const tIaNorm = normalizar(tIaAll);
    if (
      kw.E5_TENTOU.some((k) => tIaNorm.includes(k)) &&
      !habilidades.includes("realizar_agendamento")
    ) {
      habilidades.push("verificar_disponibilidade");
    }
    if (transbordo) habilidades.push("transferir_atendimento");
  }

  if (estagioCod === "E5") {
    const sub = detectE5Substage({ textoAll: tAllStr, agendou, habilidades }, kw);
    estagioLabel = sub.label;
    estagioCod = sub.cod;
  }

  return {
    sessionId: session.id,
    contactId: session.contactId ?? "",
    contato: nome || (tel ? `(${tel})` : ""),
    telefone: tel,
    canal: input.canalNome,
    status: session.status ?? "",
    criadoEm: session.createdAt ?? "",
    tipoAtendimento,
    humanos,
    estagioLabel,
    estagioCod,
    agendou,
    transbordo,
    melhoria,
    etiquetas,
    habilidades,
    motivoParada: stopReason({ cod: estagioCod, nPac, textoPac: tPacAll, agendou }),
    utmSource: session.utm?.source ?? "",
    utmCampaign: session.utm?.campaign ?? "",
    msgsPaciente: nPac,
    msgsIa: nIa,
    msgsSistema: nSys,
    msgsHumano: nHum,
    totalMsgs: messages.length,
    resumoPaciente: txtPac.length
      ? txtPac.slice(0, 4).map((p) => p.slice(0, 80)).join(" / ")
      : "(sem resposta)",
    ultimaMsgIa: txtIa.length ? txtIa[txtIa.length - 1].slice(0, 120) : "",
  };
}

// ── Deduplicação: 1 contato = 1 conversa (a mais avançada no funil) ─────────

export const STAGE_RANK: Record<string, number> = {
  E0: 0, E1: 1, E2: 2, E3: 3, E4: 4,
  "E5.1": 5.1, "E5.2": 5.2, "E5.3": 5.3, "E5.4": 5.4, "E5.5": 5.5,
  E6: 6, E7: 7, E8: 8,
};

export function dedupeByContact(rows: ConversationRow[]): ConversationRow[] {
  const rank = (r: ConversationRow) =>
    (STAGE_RANK[r.estagioCod] ?? 0) + (r.agendou ? 0.5 : 0);
  const key = (r: ConversationRow) => r.contactId || r.telefone || r.sessionId;

  const best = new Map<string, ConversationRow>();
  for (const row of rows) {
    const k = key(row);
    const cur = best.get(k);
    if (
      !cur ||
      rank(row) > rank(cur) ||
      (rank(row) === rank(cur) && row.criadoEm > cur.criadoEm)
    ) {
      best.set(k, row);
    }
  }
  return [...best.values()];
}

// ── Agregação do funil e estatísticas ────────────────────────────────────────

export const FUNNEL_ORDER = [
  "E0", "E1", "E2", "E3", "E4", "E5.1", "E5.2", "E5.3", "E5.4", "E5.5", "E6", "E7", "E8",
] as const;

export type ReportStats = {
  total: number;
  agendamentos: number;
  taxaConversao: number; // fração 0..1
  semResposta: number;
  taxaEngajamento: number; // fração 0..1
  transbordos: number;
  melhorias: number;
  iaAutonoma: number;
  humanoEnvolvido: number;
  funil: { cod: string; label: string; count: number }[];
  motivosParada: { motivo: string; count: number }[];
};

export function buildStats(rows: ConversationRow[]): ReportStats {
  const total = rows.length;
  const agendamentos = rows.filter((r) => r.agendou).length;
  const semResposta = rows.filter((r) => r.msgsPaciente === 0).length;

  const funilCount = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const cur = funilCount.get(r.estagioCod);
    if (cur) cur.count++;
    else funilCount.set(r.estagioCod, { label: r.estagioLabel, count: 1 });
  }
  const funil = FUNNEL_ORDER.filter((cod) => funilCount.has(cod)).map((cod) => ({
    cod,
    label: funilCount.get(cod)!.label,
    count: funilCount.get(cod)!.count,
  }));

  const motivoCount = new Map<string, number>();
  for (const r of rows) {
    if (r.agendou) continue;
    motivoCount.set(r.motivoParada, (motivoCount.get(r.motivoParada) ?? 0) + 1);
  }
  const motivosParada = [...motivoCount.entries()]
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    agendamentos,
    taxaConversao: total ? agendamentos / total : 0,
    semResposta,
    taxaEngajamento: total ? (total - semResposta) / total : 0,
    transbordos: rows.filter((r) => r.transbordo).length,
    melhorias: rows.filter((r) => r.melhoria).length,
    iaAutonoma: rows.filter((r) => r.tipoAtendimento === "IA Autônoma").length,
    humanoEnvolvido: rows.filter((r) => r.tipoAtendimento !== "IA Autônoma").length,
    funil,
    motivosParada,
  };
}
