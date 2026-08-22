// Rota interceptada: a configuração do sistema abre como modal sobre a matriz.
//
// Mesmo conteúdo da página cheia (`SystemConfig`), casca diferente. Duas
// implementações do mesmo formulário divergiriam — o mesmo raciocínio que fez a
// derivação de estado virar módulo puro.
import { notFound } from "next/navigation";
import { getClinicHeader } from "@/lib/systems/clinic-header";
import { SystemConfig, isSystemSlug, systemTitle } from "@/components/systems/system-config";
import { SystemConfigDialog } from "@/components/systems/system-config-dialog";

export const dynamic = "force-dynamic";

export default async function InterceptedSystemConfig({
  params,
}: {
  params: Promise<{ clinicId: string; sistema: string }>;
}) {
  const { clinicId, sistema } = await params;
  if (!isSystemSlug(sistema)) notFound();

  const clinic = await getClinicHeader(clinicId);
  if (!clinic) notFound();

  return (
    <SystemConfigDialog
      title={systemTitle(sistema)}
      subtitle={`${clinic.name} · prontuário: ${clinic.system ?? "não informado"}`}
    >
      <SystemConfig
        clinicId={clinic.id}
        clinicName={clinic.name}
        clinicSystem={clinic.system}
        slug={sistema}
      />
    </SystemConfigDialog>
  );
}
