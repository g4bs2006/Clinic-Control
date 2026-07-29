import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/token";
import { getSessionUserId } from "@/lib/auth/session";
import { processAutomationJob } from "@/lib/clinics/automation-runner";

// Cada tick varre 4 clínicas (~12 chamadas à Helena, ~4s) — folgado neste limite.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Processa UM tick de um automation_job (varredura da configuração da automação
 * de agendamento) e responde. Autenticação: assinatura HMAC interna (`sig`,
 * gerada com o AUTH_SECRET) ou sessão válida.
 *
 * Diferente dos outros jobs do projeto, este endpoint NÃO reencadeia o próximo
 * tick via `after()`. O motivo (medido em produção em 2026-07-29): quem chama
 * usa `AbortSignal.timeout` curto para não bloquear, e ao abortar a request a
 * resposta nunca é entregue — então o `after()`, que só roda depois da resposta,
 * não executa. O tick fazia o trabalho e a corrente morria no primeiro elo (job
 * parado em 4/20 com status "running" e nenhum erro registrado).
 *
 * Quem encadeia agora é o CHAMADOR, que sabe esperar: o painel da carteira
 * (sequencial, com o progresso na tela) e o endpoint do cron semanal (laço com
 * orçamento de tempo). Determinístico e observável, sem depender de semântica de
 * request abortada.
 *
 * Precisa estar em PUBLIC_PREFIXES do middleware: os ticks são chamadas
 * servidor-para-servidor sem cookie.
 */
export async function POST(request: NextRequest) {
  let body: { jobId?: string; sig?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const jobId = body.jobId ?? "";
  if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

  const sigSubject = await verifySessionToken(body.sig);
  const authorized = sigSubject === `automacao:${jobId}` || (await getSessionUserId()) != null;
  if (!authorized) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const result = await processAutomationJob(jobId);
  return NextResponse.json(result);
}
