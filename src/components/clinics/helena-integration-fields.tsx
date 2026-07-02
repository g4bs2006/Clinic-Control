"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHelenaSetupOverview, getLiveFunnel, saveIntegration } from "@/lib/clinics/integration-actions";

interface Panel {
  id: string;
  title: string;
  key: string;
  companyId: string;
}

interface FunnelStep {
  title: string;
  count: number;
}

interface FunnelPreview {
  steps: FunnelStep[];
  leads: number;
  scheduled: number;
  rate: number;
  revenue: number;
}

interface HelenaIntegrationFieldsProps {
  clinicId?: string;
  onPanelSelected: (token: string, panelId: string) => void;
}

export function HelenaIntegrationFields({
  clinicId,
  onPanelSelected,
}: HelenaIntegrationFieldsProps) {
  const [token, setToken] = useState("");
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState("");
  const [funnelPreview, setFunnelPreview] = useState<FunnelPreview | null>(null);
  const [isFetchingPanels, startFetchPanels] = useTransition();
  const [isFetchingFunnel, startFetchFunnel] = useTransition();
  const [isSavingIntegration, startSaveIntegration] = useTransition();

  // Overview status fields
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  function handleFetchPanels() {
    if (!token.trim()) {
      toast.error("Informe o token Helena antes de buscar os painéis.");
      return;
    }
    startFetchPanels(async () => {
      const result = await getHelenaSetupOverview(token);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.panels.length === 0) {
        toast.warning("Nenhum painel encontrado para este token.");
        return;
      }
      setPanels(result.panels);
      setSelectedPanelId("");
      setContactCount(result.contactCount);
      setChannels(result.channels);
      setCompanyInfo(result.company);
      toast.success(`${result.panels.length} painel(is) encontrado(s).`);
    });
  }

  function handlePanelChange(panelId: string | null) {
    if (!panelId) return;
    setSelectedPanelId(panelId);
    onPanelSelected(token, panelId);
  }

  function handleViewFunnel() {
    if (!clinicId) return;
    startFetchFunnel(async () => {
      const result = await getLiveFunnel(clinicId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFunnelPreview(result.funnel);
    });
  }

  function handleSaveIntegration() {
    if (!clinicId || !token.trim() || !selectedPanelId) {
      toast.error("Selecione um painel antes de salvar a integração.");
      return;
    }
    startSaveIntegration(async () => {
      const result = await saveIntegration(clinicId, token, selectedPanelId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Integração Helena salva com sucesso.");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Token field */}
      <div className="space-y-1.5">
        <Label htmlFor="helena-token">Token Helena</Label>
        <div className="flex gap-2">
          <Input
            id="helena-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole o token da API Helena"
            className="flex-1"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleFetchPanels}
            disabled={isFetchingPanels || !token.trim()}
          >
            {isFetchingPanels ? "Buscando…" : "Buscar painéis"}
          </Button>
        </div>
      </div>

      {/* Account Overview Status Card */}
      {(companyInfo || contactCount !== null || channels.length > 0) && (
        <div className="rounded-lg border border-border/80 bg-accent/5 p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Visão Geral da Conta Helena
            </h4>
            {companyInfo?.status && (
              <span className="rounded bg-brand px-1.5 py-0.5 text-[0.6rem] font-bold text-white uppercase tracking-wide shadow-sm">
                {companyInfo.status}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Nome da Conta</span>
              <p className="font-semibold text-foreground truncate">{companyInfo?.name ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Base de Pacientes</span>
              <p className="font-semibold text-brand-gradient tabular-nums">
                {contactCount !== null ? contactCount.toLocaleString("pt-BR") : "0"} contatos
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Status de Setup</span>
              <p className="font-medium text-foreground truncate">{companyInfo?.setupStatus ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Canais Ativos</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {channels.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nenhum canal</span>
                ) : (
                  channels.map((c: any) => {
                    const isOnline = ["connected", "active", "online", "stable", "paired", "authenticated"].includes(c.status?.toLowerCase());
                    return (
                      <span
                        key={c.id}
                        className={`rounded px-1.5 py-0.5 text-[0.62rem] font-semibold ${
                          isOnline
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {c.name || c.type || "Canal"} ({isOnline ? "Ativo" : "Inativo"})
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel select — shown only after panels are loaded */}
      {panels.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="helena-panel">Painel</Label>
          <Select value={selectedPanelId} onValueChange={handlePanelChange}>
            <SelectTrigger id="helena-panel" className="w-full">
              <SelectValue placeholder="Selecione um painel" />
            </SelectTrigger>
            <SelectContent>
              {panels.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title} ({p.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Edit-mode actions: save integration + view funnel */}
      {clinicId && (
        <div className="flex flex-wrap gap-2">
          {selectedPanelId && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveIntegration}
              disabled={isSavingIntegration}
            >
              {isSavingIntegration ? "Salvando integração…" : "Salvar integração"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleViewFunnel}
            disabled={isFetchingFunnel}
          >
            {isFetchingFunnel ? "Carregando funil…" : "Ver funil agora"}
          </Button>
        </div>
      )}

      {/* Funnel preview */}
      {funnelPreview && (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
          <p className="text-sm font-medium">Funil do mês atual</p>
          <ul className="space-y-1">
            {funnelPreview.steps.map((step) => (
              <li key={step.title} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{step.title}</span>
                <span className="font-mono">{step.count}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border pt-2 flex flex-wrap gap-4 text-sm">
            <span>
              Taxa de agendamento:{" "}
              <strong className="text-brand-gradient">{(funnelPreview.rate * 100).toFixed(1)}%</strong>
            </span>
            <span>
              Faturamento:{" "}
              <strong>
                {funnelPreview.revenue.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Create-mode note */}
      {!clinicId && selectedPanelId && (
        <p className="text-xs text-muted-foreground">
          Salve a clínica primeiro e depois edite-a para vincular o painel da Helena.
        </p>
      )}
    </div>
  );
}
