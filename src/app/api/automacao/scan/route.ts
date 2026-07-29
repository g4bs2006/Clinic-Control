import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { signSessionToken } from "@/lib/auth/token";
import { createAutomaticScanJob } from "@/lib/clinics/automation-runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Gatilho da varredura SEMANAL da automação de agendamento. Chamado pelo pg_cron
 * via pg_net (ver migration 0071), autenticado pelo header `x-cron-secret` — o
 * mesmo segredo já usado pelas Edge Functions de coleta, para não criar mais uma
 * variável de ambiente.
 *
 * Roda aqui e não numa Edge Function porque a varredura precisa DECIFRAR o token
 * da Helena de cada clínica, e a chave (HELENA_TOKEN_ENC_KEY) vive no ambiente do
 * app.
 *
 * O job criado tem `requested_by` nulo — é isso que marca a varredura como
 * automática e faz o runner notificar os gestores no fim (a manual não notifica).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "COLLECT_GROUPS_CRON_SECRET não configurado" }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const job = await createAutomaticScanJob();
  if (!job.ok) return NextResponse.json({ error: job.error }, { status: 400 });

  // Dispara o primeiro tick; os seguintes se encadeiam sozinhos.
  const origin =
    request.headers.get("x-forwarded-proto") && request.headers.get("host")
      ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
      : request.nextUrl.origin;
  after(async () => {
    const sig = await signSessionToken(`automacao:${job.jobId}`, Date.now() + 30 * 60 * 1000);
    try {
      await fetch(`${origin}/api/automacao/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.jobId, sig }),
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      /* o job fica em "na fila" e o próximo acesso à tela reencosta */
    }
  });

  return NextResponse.json({ jobId: job.jobId, total: job.total });
}
