import { notFound, redirect } from "next/navigation";
import { ClinicForm } from "@/components/clinics/clinic-form";
import { getClinic, updateClinic } from "@/lib/clinics/actions";
import { listPartnerContacts } from "@/lib/clinics/partner-contacts-actions";
import type { ClinicInput } from "@/lib/clinics/schema";

interface EditarClinicaPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarClinicaPage({ params }: EditarClinicaPageProps) {
  const { id } = await params;
  const [clinic, partnerContacts] = await Promise.all([getClinic(id), listPartnerContacts()]);

  if (!clinic) {
    notFound();
  }

  const strategists = partnerContacts.filter((c) => c.role === "strategist" && c.active).map((c) => c.name);
  const trafficManagers = partnerContacts.filter((c) => c.role === "traffic_manager" && c.active).map((c) => c.name);

  async function handleUpdate(
    input: ClinicInput
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    "use server";
    const result = await updateClinic(id, input);
    if (result.ok) {
      redirect("/clinicas");
    }
    return result;
  }

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-6 sm:p-8">
      <h1 className="text-2xl font-bold brand-header">Editar clínica</h1>
      <ClinicForm
        defaultValues={clinic}
        onSubmit={handleUpdate}
        strategists={strategists}
        trafficManagers={trafficManagers}
      />
    </main>
  );
}
