import { NextRequest, NextResponse } from "next/server";
import { createAutomaticScanJob, processAutomationJob } from "@/lib/clinics/automation-runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Orçamento de tempo do laço, com margem sobre o maxDuration. Um tick varre 4
// clínicas em ~4s, então isto cobre bem mais que a carteira atual (~20 com
// painel vinculado, ~25s). Se um dia não couber, o job fica parcial e a varredura
// da semana seguinte recomeça do zero — detectar é idempotente, não estraga nada.
const BUDGET_MS = 240_000;

/**
 * Gatilho da varredura SEMANAL da automação de agendamento. Chamado pelo pg_cron
 * via pg_net (migration 0071), autenticado pelo header `x-cron-secret` — o mesmo
 * segredo já usado pelas Edge Functions de coleta, para não criar mais uma
 * variável de ambiente.
 *
 * Roda aqui e não numa Edge Function porque a varredura precisa DECIFRAR o token
 * da Helena de cada clínica, e a chave (HELENA_TOKEN_ENC_KEY) vive no ambiente do
 * app.
 *
 * Processa os ticks em LAÇO, no próprio servidor. Não delega o encadeamento a
 * chamadas HTTP para si mesmo: no manual isso morreu no primeiro elo (a request
 * abortada impede o `after()` de rodar) e aqui, sem ninguém olhando a tela, a
 * falha passaria em silêncio até alguém reclamar que a automação parou.
 *
 * O job criado tem `requested_by` nulo — é isso que marca a varredura como
 * automática e faz o runner notificar os gestores no fim (a manual não notifica).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "COLLECT_GROUPS_CRON_SECRET não configurado" },
      { status: 500 },
    );
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const job = await createAutomaticScanJob();
  if (!job.ok) return NextResponse.json({ error: job.error }, { status: 400 });

  const started = Date.now();
  let last = { done: false, progress: 0, total: job.total };
  while (!last.done && Date.now() - started < BUDGET_MS) {
    last = await processAutomationJob(job.jobId);
  }

  return NextResponse.json({
    jobId: job.jobId,
    total: job.total,
    progress: last.progress,
    done: last.done,
    // Explícito no retorno para aparecer em net._http_response quando não terminar.
    ...(last.done ? {} : { aviso: "orçamento de tempo esgotado; job ficou parcial" }),
  });
}
