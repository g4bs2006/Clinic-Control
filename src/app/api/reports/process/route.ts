import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySessionToken } from "@/lib/auth/token";
import { getSessionUserId } from "@/lib/auth/session";
import { processReportJob } from "@/lib/reports/runner";
import { signSessionToken } from "@/lib/auth/token";

// Cada tick coleta um lote de ~40 sessões — bem abaixo deste limite.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Processa um tick de um report_job. Autenticação: assinatura HMAC interna
 * (`sig`, gerada com o AUTH_SECRET pelas server actions / pelo tick anterior)
 * ou sessão de usuário válida.
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
  const authorized = sigSubject === `report:${jobId}` || (await getSessionUserId()) != null;
  if (!authorized) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const result = await processReportJob(jobId);

  if (!result.done) {
    // Re-dispara o próximo tick depois de responder. Timeout curto: basta a
    // request chegar — o handler continua mesmo se o fetch abortar. Se o
    // encadeamento se perder, o auto-kick do polling da UI retoma o job.
    const origin =
      request.headers.get("x-forwarded-proto") && request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
        : request.nextUrl.origin;
    after(async () => {
      const sig = await signSessionToken(`report:${jobId}`, Date.now() + 10 * 60 * 1000);
      try {
        await fetch(`${origin}/api/reports/process`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId, sig }),
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        /* coberto pelo auto-kick */
      }
    });
  }

  return NextResponse.json(result);
}
