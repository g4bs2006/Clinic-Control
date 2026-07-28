// Varredura de contatos por sinais de consumo de tokens. Núcleo compartilhado
// por dois consumidores com requisitos diferentes de autenticação:
//
//   - investigate.ts  → botão "Investigar contatos" (usuário logado, só lê);
//   - containment.ts  → contenção automática disparada pelo cron (sem usuário,
//                       e ESCREVE na Helena concluindo conversas).
//
// Por isso o núcleo mora aqui, num módulo sem "use server": em investigate.ts
// todo export vira server action exposta, e a varredura não deve ser chamável
// de fora nem carregar a checagem de sessão que o cron não tem.
//
// Proxy de custo: cada mensagem do paciente dispara uma resposta da IA que relê
// o contexto inteiro — o gasto cresce com turnos × tamanho da conversa. Por isso
// o score pesa mensagens da IA, volume de texto e repetição (loops entre robôs
// repetem o mesmo texto à exaustão).

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

// Teto de sessões varridas: mantém o tempo de resposta aceitável num clique
// (cada sessão = 1+ chamadas à Helena).
export const MAX_SESSIONS = 400;
export const FETCH_CONCURRENCY = 6;
export const TOP_N = 15;

export type ContactAgg = {
  contactId: string;
  sessions: Set<string>;
  /** Sessões ainda ABERTAS do contato — as únicas que a contenção pode concluir. */
  sessoesAbertas: string[];
  msgsPaciente: number;
  msgsIa: number;
  chars: number;
  dupCount: number;
  textosPaciente: Map<string, number>;
  horas: Set<string>;
  ultimaAtividade: string;
};

export type RankedContact = {
  agg: ContactAgg;
  /** Fração das msgs do paciente que são repetições exatas (assinatura de loop). */
  dupRatio: number;
  score: number;
  /** Heurística ampla do botão de investigação — NÃO é o critério de contenção. */
  suspeito: boolean;
};

export type ScanResult = {
  token: string;
  windowDays: number;
  sessionsScanned: number;
  truncated: boolean;
  ranked: RankedContact[];
};

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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

/** Token da Helena da clínica, já descriptografado. Lança se não houver integração. */
export async function getClinicHelenaToken(clinicId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: integ } = await supabase
    .from("clinic_integrations")
    .select("helena_token_encrypted")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!integ?.helena_token_encrypted) {
    throw new Error("Clínica sem integração Helena configurada");
  }
  return decryptToken(integ.helena_token_encrypted as string);
}

/** Nome/telefone de um contato — "(sem nome)" quando a Helena não devolve nada. */
export async function resolveContact(
  token: string,
  contactId: string,
): Promise<{ nome: string; telefone: string }> {
  const raw = (await getContactRaw(token, contactId)) as RawContact | null;
  return {
    nome: raw?.name || raw?.nameWhatsapp || "(sem nome)",
    telefone: raw?.phoneNumberFormatted || raw?.phoneNumber || "",
  };
}

/**
 * Varre as conversas da clínica na janela e ranqueia os contatos por sinais de
 * consumo. Não resolve nome/telefone (1 chamada extra por contato) — quem
 * precisar chama resolveContact só para o topo.
 */
export async function scanTokenContacts(clinicId: string, windowDays: number): Promise<ScanResult> {
  const days = Math.min(7, Math.max(1, Math.floor(windowDays)));
  const token = await getClinicHelenaToken(clinicId);

  // Janela rolante até agora — investigação é "o que está acontecendo", não
  // fechamento contábil (esse é o cron).
  const after = new Date(Date.now() - days * 86400_000).toISOString();
  const before = new Date().toISOString();

  let sessions = (await listSessionsRaw(token, { after, before })) as unknown as RawSession[];
  const truncated = sessions.length > MAX_SESSIONS;
  if (truncated) {
    // Mais recentes primeiro: se há loop ativo, ele está no fim do período.
    sessions = [...sessions]
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
      .slice(0, MAX_SESSIONS);
  }

  const byContact = new Map<string, ContactAgg>();
  await mapLimit(sessions, FETCH_CONCURRENCY, async (session) => {
    const contactId = session.contactId ?? "";
    if (!contactId) return;
    const messages = (await listSessionMessages(token, session.id)) as unknown as RawMessage[];

    let agg = byContact.get(contactId);
    if (!agg) {
      agg = {
        contactId,
        sessions: new Set(),
        sessoesAbertas: [],
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
    if ((session.status ?? "").toUpperCase() !== "COMPLETED") {
      agg.sessoesAbertas.push(session.id);
    }

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
      const suspeito = dupRatio >= 0.4 || a.msgsIa >= 80 * days || (a.horas.size >= 16 && days <= 2);
      return { agg: a, dupRatio, score, suspeito };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, TOP_N);

  return { token, windowDays: days, sessionsScanned: sessions.length, truncated, ranked };
}
