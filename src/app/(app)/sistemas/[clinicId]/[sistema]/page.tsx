// Página cheia da configuração de um sistema numa clínica.
//
// É o que responde em link direto, F5 ou aba nova — a interceptação só acontece
// em navegação suave a partir da matriz. Mesmo conteúdo, sem a casca de modal.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getClinicHeader } from "@/lib/systems/clinic-header";
import { Panel } from "@/components/dashboard/panel";
import { SystemConfig, isSystemSlug, systemTitle } from "@/components/systems/system-config";

export const dynamic = "force-dynamic";

export default async function SystemConfigPage({
  params,
}: {
  params: Promise<{ clinicId: string; sistema: string }>;
}) {
  const { clinicId, sistema } = await params;
  if (!isSystemSlug(sistema)) notFound();

  const clinic = await getClinicHeader(clinicId);
  if (!clinic) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/sistemas"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          Sistemas
        </Link>
        <div>
          <h1 className="brand-header text-2xl font-bold">{systemTitle(sistema)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {clinic.name} · prontuário: {clinic.system ?? "não informado"}
          </p>
        </div>
      </div>

      <Panel>
        <SystemConfig
          clinicId={clinic.id}
          clinicName={clinic.name}
          clinicSystem={clinic.system}
          slug={sistema}
        />
      </Panel>
    </main>
  );
}
