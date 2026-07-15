"use server";

// "Investigar contatos" — complemento do alerta de gasto OpenAI: em vez de só
// dizer "a clínica gastou demais", ranqueia os contatos da Helena no período
// pelos sinais de consumo de tokens, apontando o provável vilão (outra IA,
// URA de operadora, contato em loop).
//
// Proxy de custo: cada mensagem do paciente dispara uma resposta da IA que
// relê o contexto inteiro — o gasto cresce com turnos × tamanho da conversa.
// Por isso o score pesa mensagens da IA, volume de texto e repetição
// (loops entre robôs repetem o mesmo texto à exaustão).

import { getSessionUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/crypto/token";
import { listSessionsRaw, listSessionMessages, getContactRaw } from "@/lib/helena/client";
import {
  classifySender,
  normalizar,
  type RawSession,
  type RawMessage,
  type RawContact,
} from "@/lib/reports/analysis";

// Teto de sessões varridas por investigação: mantém o tempo de resposta
// aceitável num clique (cada sessão = 1+ chamadas à Helena).
const MAX_SESSIONS = 400;
const FETCH_CONCURRENCY = 6;
const TOP_N = 15;

export type SuspectContact = {
  contactId: string;
  nome: string;
  telefone: string;
  sessions: number;
  msgsPaciente: number;
  msgsIa: number;
  /** Volume de texto trocado (caracteres) — proxy grosseiro de tokens. */
  chars: number;
  /** Fração das msgs do paciente que são repetições exatas (assinatura de loop). */
  dupRatio: number;
  /** Horas distintas do dia com atividade (robô conversa de madrugada). */
  horasAtivas: number;
  ultimaAtividade: string; // ISO
  score: number;
  suspeito: boolean;
};

export type InvestigateResult =
  | {
      ok: true;
      windowDays: number;
      sessionsScanned: number;
      truncated: boolean;
      contacts: SuspectContact[];
    }
  | { ok: false; error: string };

type Agg = {
  contactId: string;
  sessions: Set<string>;
  msgsPaciente: number;
  msgsIa: number;
  chars: number;
  dupCount: number;
  textosPaciente: Map<string, number>;
  horas: Set<string>;
  ultimaAtividade: string;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Ranqueia contatos da clínica por sinais de consumo de tokens no período. */
export async function investigateTokenContacts(
  clinicId: string,
  windowDays: number = 2,
): Promise<InvestigateResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Não autenticado" };
    const days = Math.min(7, Math.max(1, Math.floor(windowDays)));

    const supabase = createServiceClient();
    const { data: integ } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!integ?.helena_token_encrypted) {
      return { ok: false, error: "Clínica sem integração Helena configurada" };
    }
    const token = decryptToken(integ.helena_token_encrypted as string);

    // Janela rolante até agora — investigação é "o que está acontecendo",
    // não fechamento contábil (esse é o cron).
    const after = new Date(Date.now() - days * 86400_000).toISOString();
    const before = new Date().toISOString();

    let sessions = (await listSessionsRaw(token, { after, before })) as unknown as RawSession[];
    const totalSessions = sessions.length;
    const truncated = totalSessions > MAX_SESSIONS;
    if (truncated) {
      // Mais recentes primeiro: se há loop ativo, ele está no fim do período.
      sessions = [...sessions]
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
        .slice(0, MAX_SESSIONS);
    }

    const byContact = new Map<string, Agg>();
    await mapLimit(sessions, FETCH_CONCURRENCY, async (session) => {
      const contactId = session.contactId ?? "";
      if (!contactId) return;
      const messages = (await listSessionMessages(token, session.id)) as unknown as RawMessage[];

      let agg = byContact.get(contactId);
      if (!agg) {
        agg = {
          contactId,
          sessions: new Set(),
          msgsPaciente: 0,
          msgsIa: 0,
          chars: 0,
          dupCount: 0,
          textosPaciente: new Map(),
          horas: new Set(),
          ultimaAtividade: "",
        };
        byContact.set(contactId, agg);
      }
      agg.sessions.add(session.id);

      for (const msg of messages) {
        const { categoria } = classifySender(msg);
        const text = String(msg.text ?? "");
        const when = String(msg.createdAt ?? "");
        if (when > agg.ultimaAtividade) agg.ultimaAtividade = when;
        if (when) agg.horas.add(when.slice(11, 13));

        if (categoria === "PACIENTE") {
          agg.msgsPaciente += 1;
          agg.chars += text.length;
          const norm = normalizar(text);
          if (norm) {
            const seen = agg.textosPaciente.get(norm) ?? 0;
            if (seen > 0) agg.dupCount += 1;
            agg.textosPaciente.set(norm, seen + 1);
          }
        } else if (categoria === "IA") {
          agg.msgsIa += 1;
          agg.chars += text.length;
        }
      }
    });

    // Score: turnos da IA dominam o custo; repetição multiplica a suspeita.
    const ranked = [...byContact.values()]
      .filter((a) => a.msgsIa + a.msgsPaciente > 0)
      .map((a) => {
        const dupRatio = a.msgsPaciente > 0 ? a.dupCount / a.msgsPaciente : 0;
        const score = (a.msgsIa * 2 + a.msgsPaciente) * (1 + 2 * dupRatio) + a.sessions.size * 5;
        const suspeito =
          dupRatio >= 0.4 ||
          a.msgsIa >= 80 * days ||
          (a.horas.size >= 16 && days <= 2);
        return { agg: a, dupRatio, score, suspeito };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, TOP_N);

    // Nome/telefone só para o top (1 chamada por contato, com cache implícito
    // pelo dedup do ranking).
    const contacts = await mapLimit(ranked, FETCH_CONCURRENCY, async ({ agg, dupRatio, score, suspeito }) => {
      const raw = (await getContactRaw(token, agg.contactId)) as RawContact | null;
      return {
        contactId: agg.contactId,
        nome: raw?.name || raw?.nameWhatsapp || "(sem nome)",
        telefone: raw?.phoneNumberFormatted || raw?.phoneNumber || "",
        sessions: agg.sessions.size,
        msgsPaciente: agg.msgsPaciente,
        msgsIa: agg.msgsIa,
        chars: agg.chars,
        dupRatio,
        horasAtivas: agg.horas.size,
        ultimaAtividade: agg.ultimaAtividade,
        score,
        suspeito,
      } satisfies SuspectContact;
    });

    return {
      ok: true,
      windowDays: days,
      sessionsScanned: sessions.length,
      truncated,
      contacts,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao investigar contatos" };
  }
}
