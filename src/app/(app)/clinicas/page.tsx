import Link from "next/link";
import { listClinics } from "@/lib/clinics/actions";
import { listVisibleCheckItems, listAllClinicChecks } from "@/lib/clinics/check-items-actions";
import { getCarteiraScope } from "@/lib/users/actions";
import { ClinicTable } from "@/components/clinics/clinic-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ClinicasPage() {
  const [allClinics, checkItems, allChecksMap, scope] = await Promise.all([
    listClinics(),
    listVisibleCheckItems(),
    listAllClinicChecks(),
    getCarteiraScope(),
  ]);

  // Escopo por carteira: desenvolvedor vê só a sua; gestor filtra pelo seletor global.
  const clinics = scope.developerFilter
    ? allClinics.filter((c) => c.developer_id === scope.developerFilter)
    : allClinics;

  // Convert Map<string, Map<string, boolean>> to a serializable Record
  const allChecks: Record<string, Record<string, boolean>> = {};
  for (const [clinicId, checksMap] of allChecksMap) {
    allChecks[clinicId] = Object.fromEntries(checksMap);
  }

  return (
    <main className="p-4 space-y-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold brand-header">Clínicas</h1>
        <Button render={<Link href="/clinicas/nova">Nova clínica</Link>} />
      </div>
      <ClinicTable
        clinics={clinics}
        checkItems={checkItems}
        allChecks={allChecks}
        developers={scope.developerOptions}
      />
    </main>
  );
}
