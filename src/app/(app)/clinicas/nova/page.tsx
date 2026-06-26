import { redirect } from "next/navigation";
import { ClinicForm } from "@/components/clinics/clinic-form";
import { createClinic } from "@/lib/clinics/actions";
import type { ClinicInput } from "@/lib/clinics/schema";

export default async function NovaClinicaPage() {
  async function handleCreate(
    input: ClinicInput
  ): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
    "use server";
    const result = await createClinic(input);
    if (result.ok) {
      redirect("/clinicas");
    }
    return result;
  }

  return (
    <main className="p-8 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Nova clínica</h1>
      <ClinicForm onSubmit={handleCreate} />
    </main>
  );
}
