// Contenção ativa de gasto OpenAI. Roda no Next (não na Edge Function) porque
// depende do token Helena descriptografado e do client — que só existem aqui.
//
// Uma rodada, para UMA clínica que estourou o limite diário:
//   1. varre as conversas das últimas 48h (scan.ts, o mesmo do botão manual);
//   2. aplica o critério de loop — conservador de propósito, ver isLoop();
//   3. conclui na Helena as conversas dos contatos em loop, com nota interna
//      explicando o motivo, até o teto configurado;
//   4. grava evidências de TUDO que foi avaliado, para o relatório do grupo e
//      para auditar um eventual falso positivo depois.
//
// Concluir uma conversa é uma ação que o paciente enxerga e que a clínica não
// pediu. Todo o desenho aqui é feito para errar para o lado de não agir: o
// critério exige três sinais simultâneos, há teto por rodada, kill switch em
// Configurações, e nada acontece sem deixar rastro em openai_containment_actions.

import { createServiceClient } from "@/lib/supabase/service";
import { completeSession, addSessionNote } from "@/lib/helena/client";
import { scanTokenContacts, resolveContact, type RankedContact } from "./scan";

export type ContainmentSettings = {
  enabled: boolean;
  maxSessions: number;
  minDupRatio: number;
  minIaMsgs: number;
  minActiveHours: number;
  windowDays: number;
};

export type ContainmentRunResult = {
  runId: string;
  clinicId: string;
  clinicName: string;
  dryRun: boolean;
  sessionsScanned: number;
  suspectsFound: number;
  sessionsClosed: number;
};

const DEFAULTS: ContainmentSettings = {
  enabled: true,
  maxSessions: 5,
  minDupRatio: 0.5,
  minIaMsgs: 40,
  minActiveHours: 12,
  windowDays: 2,
};

export async function getContainmentSettings(): Promise<ContainmentSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("openai_alert_settings")
    .select(
      "containment_enabled, containment_max_sessions, containment_min_dup_ratio, containment_min_ia_msgs, containment_min_active_hours, containment_window_days",
    )
    .eq("id", true)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    enabled: (data.containment_enabled as boolean) ?? DEFAULTS.enabled,
    maxSessions: Number(data.containment_max_sessions ?? DEFAULTS.maxSessions),
    minDupRatio: Number(data.containment_min_dup_ratio ?? DEFAULTS.minDupRatio),
    minIaMsgs: Number(data.containment_min_ia_msgs ?? DEFAULTS.minIaMsgs),
    minActiveHours: Number(data.containment_min_active_hours ?? DEFAULTS.minActiveHours),
    windowDays: Number(data.containment_window_days ?? DEFAULTS.windowDays),
  };
}

/**
 * Critério de loop: E lógico dos três sinais, não OU.
 *
 * O `suspeito` do botão de investigação é um OU e por isso pega clínica
 * movimentada legítima — serve para ranquear numa tela onde um humano decide.
 * Aqui ninguém decide depois, então o critério precisa descrever algo que um
 * paciente real não faz:
 *   - repetir literalmente metade das próprias mensagens;
 *   - E arrancar dezenas de respostas da IA;
 *   - E estar ativo em 12+ horas distintas do mesmo dia.
 * Robô/URA em loop bate os três com folga; gente não bate os três juntos.
 */
export function isLoop(c: RankedContact, s: ContainmentSettings): boolean {
  return (
    c.dupRatio >= s.minDupRatio &&
    c.agg.msgsIa >= s.minIaMsgs &&
    c.agg.horas.size >= s.minActiveHours
  );
}

/** Quantos dos três sinais o contato bate — usado para explicar os "quase". */
function signalsHit(c: RankedContact, s: ContainmentSettings): number {
  return (
    (c.dupRatio >= s.minDupRatio ? 1 : 0) +
    (c.agg.msgsIa >= s.minIaMsgs ? 1 : 0) +
    (c.agg.horas.size >= s.minActiveHours ? 1 : 0)
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function loopReason(c: RankedContact): string {
  return (
    `${pct(c.dupRatio)} das mensagens do contato são repetição literal, ` +
    `${c.agg.msgsIa} respostas da IA e atividade em ${c.agg.horas.size} horas distintas do dia`
  );
}

function sparedReason(c: RankedContact, s: ContainmentSettings): string {
  const faltou: string[] = [];
  if (c.dupRatio < s.minDupRatio) faltou.push(`repetição ${pct(c.dupRatio)} (< ${pct(s.minDupRatio)})`);
  if (c.agg.msgsIa < s.minIaMsgs) faltou.push(`${c.agg.msgsIa} respostas da IA (< ${s.minIaMsgs})`);
  if (c.agg.horas.size < s.minActiveHours)
    faltou.push(`${c.agg.horas.size} horas ativas (< ${s.minActiveHours})`);
  return `Não concluída — ${faltou.join("; ")}`;
}

function noteText(c: RankedContact, costUsd: number, day: string): string {
  return [
    "🤖 Conversa concluída automaticamente pelo Clinic Control.",
    "",
    `Motivo: consumo de IA da clínica atingiu US$ ${costUsd.toFixed(2)} em ${day} (UTC) e esta conversa`,
    "apresenta assinatura de loop automático (robô/URA respondendo a robô), não de atendimento real.",
    "",
    "Evidências:",
    `• ${pct(c.dupRatio)} das mensagens do contato são repetição literal`,
    `• ${c.agg.msgsIa} respostas da IA no período`,
    `• atividade em ${c.agg.horas.size} horas distintas do dia`,
    `• ${c.agg.sessions.size} conversa(s) e ${c.agg.chars.toLocaleString("pt-BR")} caracteres trocados`,
    "",
    "O chatbot foi interrompido nesta conversa. Se isto for um atendimento legítimo,",
    "basta iniciar uma nova conversa com o contato — e avise a equipe para ajustarmos o critério.",
  ].join("\n");
}

/**
 * Executa um run da fila. Idempotente por (clinic_id, day) via unique index:
 * um run já concluído não é reprocessado.
 */
export async function processContainmentRun(runId: string): Promise<ContainmentRunResult> {
  const supabase = createServiceClient();

  const { data: run, error: runErr } = await supabase
    .from("openai_containment_runs")
    .select("id, clinic_id, day, cost_usd, status")
    .eq("id", runId)
    .maybeSingle();
  if (runErr || !run) throw new Error(runErr?.message ?? "Run não encontrado");
  if (run.status === "concluido") throw new Error("Run já processado");

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", run.clinic_id)
    .maybeSingle();
  const clinicName = (clinic?.name as string) ?? "(clínica)";

  const settings = await getContainmentSettings();
  // Kill switch desligado não cancela a rodada: ela roda em modo simulado, e o
  // relatório do grupo continua dizendo o que teria sido fechado. É assim que
  // dá para reativar com confiança depois de um susto.
  const dryRun = !settings.enabled;

  await supabase
    .from("openai_containment_runs")
    .update({ status: "rodando", dry_run: dryRun, started_at: new Date().toISOString() })
    .eq("id", runId);

  try {
    const scan = await scanTokenContacts(run.clinic_id as string, settings.windowDays);
    const loops = scan.ranked.filter((c) => isLoop(c, settings));

    type ActionRow = {
      run_id: string;
      clinic_id: string;
      session_id: string;
      contact_id: string;
      contact_name: string;
      contact_phone: string;
      outcome: "concluida" | "poupada" | "falhou" | "simulada";
      reason: string;
      msgs_ia: number;
      msgs_paciente: number;
      dup_ratio: number;
      active_hours: number;
      chars: number;
      score: number;
      last_activity: string | null;
      error?: string;
    };
    const actions: ActionRow[] = [];
    let closed = 0;

    const base = (c: RankedContact, sessionId: string, nome: string, telefone: string) => ({
      run_id: runId,
      clinic_id: run.clinic_id as string,
      session_id: sessionId,
      contact_id: c.agg.contactId,
      contact_name: nome,
      contact_phone: telefone,
      msgs_ia: c.agg.msgsIa,
      msgs_paciente: c.agg.msgsPaciente,
      dup_ratio: Number(c.dupRatio.toFixed(4)),
      active_hours: c.agg.horas.size,
      chars: c.agg.chars,
      score: Number(c.score.toFixed(2)),
      last_activity: c.agg.ultimaAtividade || null,
    });

    // ── Contatos em loop, do mais caro para o menos caro ────────────────────
    // Um contato pode ter várias conversas abertas; o teto conta CONVERSAS,
    // porque é conversa que consome token.
    for (const c of loops) {
      if (closed >= settings.maxSessions) break;
      const { nome, telefone } = await resolveContact(scan.token, c.agg.contactId);
      const reason = loopReason(c);

      for (const sessionId of c.agg.sessoesAbertas) {
        if (closed >= settings.maxSessions) break;

        if (dryRun) {
          actions.push({ ...base(c, sessionId, nome, telefone), outcome: "simulada", reason });
          closed += 1;
          continue;
        }

        try {
          // Nota antes de concluir: se a conclusão falhar, a clínica ainda vê
          // o diagnóstico na conversa. A ordem inversa deixaria conversa
          // fechada sem explicação quando a segunda chamada falhasse.
          await addSessionNote(
            scan.token,
            sessionId,
            noteText(c, Number(run.cost_usd), run.day as string),
          ).catch(() => {});
          await completeSession(scan.token, sessionId, {
            reactivateOnNewMessage: false,
            stopBotInExecution: true,
          });
          actions.push({ ...base(c, sessionId, nome, telefone), outcome: "concluida", reason });
          closed += 1;
        } catch (e) {
          actions.push({
            ...base(c, sessionId, nome, telefone),
            outcome: "falhou",
            reason,
            error: e instanceof Error ? e.message : "erro desconhecido",
          });
        }
      }
    }

    // ── Os "quase": 2 dos 3 sinais ──────────────────────────────────────────
    // Entram no relatório para calibrar os limiares com casos reais em vez de
    // palpite. Limitado a 3 para não afogar a mensagem do grupo.
    const quase = scan.ranked
      .filter((c) => !isLoop(c, settings) && signalsHit(c, settings) >= 2)
      .slice(0, 3);
    for (const c of quase) {
      const sessionId = c.agg.sessoesAbertas[0] ?? [...c.agg.sessions][0];
      if (!sessionId) continue;
      const { nome, telefone } = await resolveContact(scan.token, c.agg.contactId);
      actions.push({
        ...base(c, sessionId, nome, telefone),
        outcome: "poupada",
        reason: sparedReason(c, settings),
      });
    }

    if (actions.length) {
      // onConflict: o unique (run_id, session_id) protege contra um retry
      // parcial gravar a mesma conversa duas vezes.
      await supabase
        .from("openai_containment_actions")
        .upsert(actions, { onConflict: "run_id,session_id", ignoreDuplicates: true });
    }

    await supabase
      .from("openai_containment_runs")
      .update({
        status: "concluido",
        sessions_scanned: scan.sessionsScanned,
        suspects_found: loops.length,
        sessions_closed: closed,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      clinicId: run.clinic_id as string,
      clinicName,
      dryRun,
      sessionsScanned: scan.sessionsScanned,
      suspectsFound: loops.length,
      sessionsClosed: closed,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha na contenção";
    await supabase
      .from("openai_containment_runs")
      .update({ status: "erro", error: message, finished_at: new Date().toISOString() })
      .eq("id", runId);
    throw e;
  }
}

/** Próximo run da fila (o mais antigo). Null quando a fila esvazia. */
export async function nextQueuedRunId(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("openai_containment_runs")
    .select("id")
    .eq("status", "na fila")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}
