import { redirect } from "next/navigation";
import { ClinicForm } from "@/components/clinics/clinic-form";
import { createClinic } from "@/lib/clinics/actions";
import { runProvisioning } from "@/lib/clinics/provision-actions";
import type { ClinicInput } from "@/lib/clinics/schema";

export default async function NovaClinicaPage() {
  async function handleCreate(
    input: ClinicInput,
    opts?: { provisionHelena?: boolean }
  ): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
    "use server";
    const result = await createClinic(input);
    if (result.ok) {
      if (opts?.provisionHelena) {
        // roda o pipeline (idempotente) e cai no perfil, onde o checklist aparece
        await runProvisioning(result.id);
        redirect(`/clinicas/${result.id}`);
      }
      redirect("/clinicas");
    }
    return result;
  }

  return (
    <main className="p-8 max-w-xl space-y-6">
      <h1 className="text-2xl font-bold brand-header">Nova clínica</h1>
      <ClinicForm onSubmit={handleCreate} />
    </main>
  );
}
