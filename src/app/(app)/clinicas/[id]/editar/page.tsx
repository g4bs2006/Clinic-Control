import { notFound, redirect } from "next/navigation";
import { ClinicForm } from "@/components/clinics/clinic-form";
import { getClinic, updateClinic } from "@/lib/clinics/actions";
import type { ClinicInput } from "@/lib/clinics/schema";

interface EditarClinicaPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarClinicaPage({ params }: EditarClinicaPageProps) {
  const { id } = await params;
  const clinic = await getClinic(id);

  if (!clinic) {
    notFound();
  }

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
      <ClinicForm defaultValues={clinic} onSubmit={handleUpdate} />
    </main>
  );
}
