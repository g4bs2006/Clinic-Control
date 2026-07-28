"use server";

// "Investigar contatos" — complemento do alerta de gasto OpenAI: em vez de só
// dizer "a clínica gastou demais", ranqueia os contatos da Helena no período
// pelos sinais de consumo de tokens, apontando o provável vilão (outra IA,
// URA de operadora, contato em loop).
//
// Só LÊ. A varredura em si vive em ./scan (módulo puro, compartilhado com a
// contenção automática, que além de ler também conclui conversas).

import { getSessionUser } from "@/lib/auth/session";
import { scanTokenContacts, resolveContact, mapLimit, FETCH_CONCURRENCY } from "./scan";

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

/** Ranqueia contatos da clínica por sinais de consumo de tokens no período. */
export async function investigateTokenContacts(
  clinicId: string,
  windowDays: number = 2,
): Promise<InvestigateResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Não autenticado" };

    const scan = await scanTokenContacts(clinicId, windowDays);

    // Nome/telefone só para o top (1 chamada por contato, com cache implícito
    // pelo dedup do ranking).
    const contacts = await mapLimit(
      scan.ranked,
      FETCH_CONCURRENCY,
      async ({ agg, dupRatio, score, suspeito }) => {
        const { nome, telefone } = await resolveContact(scan.token, agg.contactId);
        return {
          contactId: agg.contactId,
          nome,
          telefone,
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
      },
    );

    return {
      ok: true,
      windowDays: scan.windowDays,
      sessionsScanned: scan.sessionsScanned,
      truncated: scan.truncated,
      contacts,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao investigar contatos" };
  }
}
