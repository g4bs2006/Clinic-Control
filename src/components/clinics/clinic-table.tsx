import Link from "next/link";
import { archiveClinic } from "@/lib/clinics/actions";
import type { Clinic } from "@/lib/clinics/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const modeLabels: Record<Clinic["mode"], string> = {
  auto: "Automático",
  manual: "Manual",
};

const modeColors: Record<Clinic["mode"], string> = {
  auto: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  manual: "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30",
};

const statusLabels: Record<Clinic["contract_status"], string> = {
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
};

const statusColors: Record<Clinic["contract_status"], string> = {
  active: "bg-green-500/20 text-green-300 border border-green-500/30",
  suspended: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  archived: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
};

interface ClinicTableProps {
  clinics: Clinic[];
}

export function ClinicTable({ clinics }: ClinicTableProps) {
  if (clinics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-lg font-medium text-foreground">Nenhuma clínica cadastrada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Clique em &ldquo;Nova clínica&rdquo; para adicionar a primeira.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Cidade/UF</TableHead>
          <TableHead>Região</TableHead>
          <TableHead>Modo</TableHead>
          <TableHead>Status do contrato</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clinics.map((clinic) => (
          <TableRow key={clinic.id}>
            <TableCell className="font-medium">{clinic.name}</TableCell>
            <TableCell>
              {clinic.city && clinic.state
                ? `${clinic.city}/${clinic.state}`
                : clinic.city ?? clinic.state ?? "—"}
            </TableCell>
            <TableCell>{clinic.region ?? "—"}</TableCell>
            <TableCell>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${modeColors[clinic.mode]}`}
              >
                {modeLabels[clinic.mode]}
              </span>
            </TableCell>
            <TableCell>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[clinic.contract_status]}`}
              >
                {statusLabels[clinic.contract_status]}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/clinicas/${clinic.id}/editar`}
                  className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                >
                  Editar
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await archiveClinic(clinic.id);
                  }}
                >
                  <Button variant="destructive" size="sm" type="submit">
                    Arquivar
                  </Button>
                </form>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
