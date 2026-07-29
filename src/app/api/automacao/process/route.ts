import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySessionToken, signSessionToken } from "@/lib/auth/token";
import { getSessionUserId } from "@/lib/auth/session";
import { processAutomationJob } from "@/lib/clinics/automation-runner";

// Cada tick varre 4 clínicas (~12 chamadas à Helena) — folgado neste limite.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Processa um tick de um automation_job (varredura da configuração da automação
 * de agendamento). Autenticação: assinatura HMAC interna (`sig`, gerada com o
 * AUTH_SECRET pela server action ou pelo tick anterior) ou sessão válida —
 * mesmo padrão de /api/tasks/generate/process.
 *
 * Precisa estar em PUBLIC_PREFIXES do middleware: os ticks são chamadas
 * servidor-para-servidor sem cookie, e sem isso o job fica preso em "na fila".
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

  if (!result.done) {
    // Re-dispara o próximo tick depois de responder. Timeout curto: basta a
    // request chegar. O host vem dos headers porque o container não deve sair
    // para a internet para se chamar (ver nginx X-Forwarded-Proto na VPS).
    const origin =
      request.headers.get("x-forwarded-proto") && request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
        : request.nextUrl.origin;
    after(async () => {
      const sig = await signSessionToken(`automacao:${jobId}`, Date.now() + 10 * 60 * 1000);
      try {
        await fetch(`${origin}/api/automacao/process`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId, sig }),
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        /* coberto pelo auto-kick do polling da UI */
      }
    });
  }

  return NextResponse.json(result);
}
