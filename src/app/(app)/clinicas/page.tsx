import Link from "next/link";
import { listClinics } from "@/lib/clinics/actions";
import { ClinicTable } from "@/components/clinics/clinic-table";
import { Button } from "@/components/ui/button";

export default async function ClinicasPage() {
  const clinics = await listClinics();
  return (
    <main className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clínicas</h1>
        <Button render={<Link href="/clinicas/nova">Nova clínica</Link>} />
      </div>
      <ClinicTable clinics={clinics} />
    </main>
  );
}
