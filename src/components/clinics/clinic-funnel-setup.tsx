"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateClinicMode } from "@/lib/clinics/actions";
import { HelenaIntegrationFields } from "./helena-integration-fields";
import { ClinicManualMetricsForm } from "./clinic-manual-metrics-form";

interface ClinicFunnelSetupProps {
  clinicId: string;
  initialMode: "auto" | "manual";
  currentMonth: string;
  initialLeads: number;
  initialScheduled: number;
  hasData: boolean;
}

export function ClinicFunnelSetup({
  clinicId,
  initialMode,
  currentMonth,
  initialLeads,
  initialScheduled,
  hasData,
}: ClinicFunnelSetupProps) {
  const [mode, setMode] = useState<"auto" | "manual">(initialMode);
  const [pending, startTransition] = useTransition();

  function handleModeChange(checked: boolean) {
    const nextMode = checked ? "auto" : "manual";
    const prevMode = mode;
    setMode(nextMode); // optimistic update

    startTransition(async () => {
      const res = await updateClinicMode(clinicId, nextMode);
      if (!res.ok) {
        setMode(prevMode); // revert
        toast.error(res.error);
      } else {
        toast.success(`Clínica configurada como ${nextMode === "auto" ? "Automática" : "Manual"}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle selector */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-accent/10 p-3.5">
        <Switch
          id="setup-mode"
          checked={mode === "auto"}
          onCheckedChange={handleModeChange}
          disabled={pending}
        />
        <div className="space-y-0.5 cursor-pointer">
          <Label htmlFor="setup-mode" className="text-sm font-semibold cursor-pointer">
            Modo automático (integração Helena)
          </Label>
          <p className="text-xs text-muted-foreground">
            {mode === "auto"
              ? "Os dados do funil serão integrados automaticamente da Helena"
              : "Os dados de leads e agendamentos serão gerenciados manualmente"}
          </p>
        </div>
      </div>

      {/* Conditional rendering of either integration setup or manual metrics */}
      <div className="border-t border-border/40 pt-4">
        {mode === "auto" ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Configurar Integração CRM Helena</h4>
            <HelenaIntegrationFields
              clinicId={clinicId}
              onPanelSelected={(_token, _panelId) => {}}
            />
          </div>
        ) : (
          <ClinicManualMetricsForm
            clinicId={clinicId}
            currentMonth={currentMonth}
            initialLeads={initialLeads}
            initialScheduled={initialScheduled}
            hasData={hasData}
          />
        )}
      </div>
    </div>
  );
}
