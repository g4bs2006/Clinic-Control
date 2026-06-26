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
    <main className="p-8 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Editar clínica</h1>
      <ClinicForm defaultValues={clinic} onSubmit={handleUpdate} />
    </main>
  );
}
