import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { processContainmentRun, nextQueuedRunId } from "@/lib/openai-usage/containment";

// Uma rodada varre até 400 conversas da Helena (várias chamadas por conversa) e
// depois conclui algumas — bem mais que os ~15s padrão de server action.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Processa UM run da fila de contenção de gasto OpenAI.
 *
 * Quem chama:
 *   - collect-openai-usage (Edge Function), logo após enfileirar um run —
 *     autentica com `x-cron-secret`, que do lado do Supabase se chama
 *     CRON_SECRET e aqui COLLECT_GROUPS_CRON_SECRET (mesmo valor, ver
 *     syncOpenAiKeys em lib/openai-usage/actions);
 *   - ele mesmo, encadeando enquanto sobrar run na fila;
 *   - a UI, para reprocessar manualmente (sessão de usuário).
 *
 * Precisa estar em PUBLIC_PREFIXES do middleware: a chamada da Edge Function
 * não tem cookie de sessão e seria redirecionada para /login antes de chegar
 * aqui — o job ficaria preso em "na fila" para sempre.
 */
/**
 * Pede à Edge Function notify que mande o relatório ao grupo. O envio mora lá
 * porque as credenciais da Evolution (NOTIFY_*) só existem no Supabase — o Next
 * não tem como falar com o WhatsApp direto.
 */
async function notifyContainment(): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = (process.env.COLLECT_GROUPS_CRON_SECRET ?? "").trim();
  if (!baseUrl || !secret) return;
  try {
    await fetch(`${baseUrl}/functions/v1/notify?type=contencao`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    /* runs seguem com notified_at nulo; o próximo disparo os inclui */
  }
}

export async function POST(request: NextRequest) {
  const cronSecret = (process.env.COLLECT_GROUPS_CRON_SECRET ?? "").trim();
  const headerSecret = (request.headers.get("x-cron-secret") ?? "").trim();
  const fromCron = cronSecret.length > 0 && headerSecret === cronSecret;
  const authorized = fromCron || (await getSessionUserId()) != null;
  if (!authorized) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let body: { runId?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* body é opcional: sem runId processamos o próximo da fila */
  }

  const runId = body.runId ?? (await nextQueuedRunId());
  if (!runId) return NextResponse.json({ ok: true, idle: true });

  let result;
  try {
    result = await processContainmentRun(runId);
  } catch (e) {
    // O runner já marcou o run como 'erro'; devolvemos 200 para o cron não
    // reenfileirar em cima de uma falha determinística (clínica sem Helena,
    // por exemplo) e o erro fica visível no run e no relatório do grupo.
    return NextResponse.json({
      ok: false,
      runId,
      error: e instanceof Error ? e.message : "Falha na contenção",
    });
  }

  // Encadeia o próximo da fila depois de responder — um dia ruim pode alertar
  // várias clínicas de uma vez e cada uma leva dezenas de segundos.
  const remaining = await nextQueuedRunId();
  if (remaining) {
    const origin =
      request.headers.get("x-forwarded-proto") && request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
        : request.nextUrl.origin;
    after(async () => {
      try {
        await fetch(`${origin}/api/openai-containment/process`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-cron-secret": cronSecret },
          body: JSON.stringify({ runId: remaining }),
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        /* o próximo cron retoma a fila */
      }
    });
  } else {
    // Fila vazia: hora do relatório. Sai um único aviso cobrindo todos os runs
    // da rodada, em vez de um por clínica — a notify junta os que estiverem com
    // notified_at nulo. Se este disparo falhar, o próximo o recupera.
    after(() => notifyContainment());
  }

  return NextResponse.json({ ok: true, ...result });
}
