"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertManualSnapshot } from "@/lib/snapshots/actions";

interface ClinicManualMetricsFormProps {
  clinicId: string;
  currentMonth: string;
  initialLeads: number;
  initialScheduled: number;
  hasData: boolean;
}

export function ClinicManualMetricsForm({
  clinicId,
  currentMonth,
  initialLeads,
  initialScheduled,
  hasData,
}: ClinicManualMetricsFormProps) {
  const [isEditing, setIsEditing] = useState(!hasData);
  const [leads, setLeads] = useState(initialLeads.toString());
  const [scheduled, setScheduled] = useState(initialScheduled.toString());
  const [pending, startTransition] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const l = parseInt(leads, 10);
    const s = parseInt(scheduled, 10);

    if (isNaN(l) || l < 0) {
      toast.error("Leads deve ser um número válido maior ou igual a 0.");
      return;
    }
    if (isNaN(s) || s < 0) {
      toast.error("Agendados deve ser um número válido maior ou igual a 0.");
      return;
    }
    if (s > l) {
      toast.error("Agendados não pode ser maior que o número de Leads.");
      return;
    }

    startTransition(async () => {
      const res = await upsertManualSnapshot(clinicId, currentMonth, l, s);
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Dados salvos com sucesso!");
        setIsEditing(false);
      }
    });
  }

  function handleCancel() {
    setLeads(initialLeads.toString());
    setScheduled(initialScheduled.toString());
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="space-y-4 py-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Registrar Dados (Mês Atual)
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="metric-leads">Leads</Label>
            <Input
              id="metric-leads"
              type="number"
              min="0"
              value={leads}
              onChange={(e) => setLeads(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metric-scheduled">Agendados</Label>
            <Input
              id="metric-scheduled"
              type="number"
              min="0"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              required
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending} className="gap-1">
            <Check className="size-3.5" />
            Salvar
          </Button>
          {hasData && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={pending}
              className="gap-1"
            >
              <X className="size-3.5" />
              Cancelar
            </Button>
          )}
        </div>
      </form>
    );
  }

  // Display summary of manually entered metrics
  const rate = initialLeads > 0 ? (initialScheduled / initialLeads) * 100 : 0;

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Dados Manuais Registrados
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="gap-1.5 h-8"
        >
          <Pencil className="size-3.5" />
          Editar Dados
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/50 bg-accent/20 p-3">
        <div className="flex flex-col">
          <span className="text-[0.65rem] uppercase text-muted-foreground font-medium">Leads</span>
          <span className="text-lg font-bold text-foreground tabular-nums">{initialLeads}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[0.65rem] uppercase text-muted-foreground font-medium">Agendados</span>
          <span className="text-lg font-bold text-foreground tabular-nums">{initialScheduled}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[0.65rem] uppercase text-muted-foreground font-medium">Taxa</span>
          <span className="text-lg font-bold text-primary tabular-nums">
            {rate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </span>
        </div>
      </div>
    </div>
  );
}
