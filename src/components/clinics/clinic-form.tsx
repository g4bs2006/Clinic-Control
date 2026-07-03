"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Clinic, ClinicInput } from "@/lib/clinics/schema";
import { CLINIC_SYSTEMS } from "@/lib/clinics/systems";
import { HelenaIntegrationFields } from "@/components/clinics/helena-integration-fields";
import {
  HELENA_APPS,
  HELENA_RESOURCERS,
  HELENA_CONFIG_FIELDS,
  DEFAULT_PROVISION_OPTIONS,
  type HelenaProvisionOptions,
} from "@/lib/helena/provision-options";

const SYSTEM_NONE = "__none__";

type ContractStatus = "active" | "suspended" | "archived";
type Mode = "manual" | "auto";

interface ClinicFormProps {
  defaultValues?: Clinic;
  onSubmit: (
    input: ClinicInput,
    opts?: { provisionHelena?: boolean; helenaOptions?: HelenaProvisionOptions }
  ) => Promise<{ ok: true; id?: string } | { ok: true } | { ok: false; error: string }>;
}

export function ClinicForm({ defaultValues, onSubmit }: ClinicFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [address, setAddress] = useState(defaultValues?.address ?? "");
  const [city, setCity] = useState(defaultValues?.city ?? "");
  const [state, setState] = useState(defaultValues?.state ?? "");
  const [mode, setMode] = useState<Mode>(defaultValues?.mode ?? "manual");
  const [contractStatus, setContractStatus] = useState<ContractStatus>(
    defaultValues?.contract_status ?? "active"
  );
  const [system, setSystem] = useState<string>(defaultValues?.system ?? "");
  const [ownerName, setOwnerName] = useState(defaultValues?.owner_name ?? "");
  const [ownerEmail, setOwnerEmail] = useState(defaultValues?.owner_email ?? "");
  const [ownerPhone, setOwnerPhone] = useState(defaultValues?.owner_phone ?? "");
  const [legalName, setLegalName] = useState(defaultValues?.legal_name ?? "");
  const [documentId, setDocumentId] = useState(defaultValues?.document_id ?? "");
  const [provisionHelena, setProvisionHelena] = useState(false);
  const [helenaApps, setHelenaApps] = useState<string[]>([...DEFAULT_PROVISION_OPTIONS.apps]);
  const [helenaResourcers, setHelenaResourcers] = useState<string[]>([
    ...DEFAULT_PROVISION_OPTIONS.resourcers,
  ]);
  const [helenaConfig, setHelenaConfig] = useState<Record<string, number>>({
    ...DEFAULT_PROVISION_OPTIONS.config,
  });
  const [isPending, startTransition] = useTransition();

  function toggleIn(list: string[], value: string, checked: boolean) {
    return checked ? [...list, value] : list.filter((v) => v !== value);
  }

  const isCreate = !defaultValues;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isCreate && provisionHelena && helenaApps.length === 0) {
      toast.error("Selecione pelo menos um app da Helena — a API exige.");
      return;
    }

    const input: ClinicInput = {
      name,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      mode,
      contract_status: contractStatus,
      system: system || undefined,
      owner_name: ownerName || undefined,
      owner_email: ownerEmail || undefined,
      owner_phone: ownerPhone || undefined,
      legal_name: legalName || undefined,
      document_id: documentId ? documentId.replace(/\D/g, "") : undefined,
    };

    startTransition(async () => {
      const wantsProvision = isCreate && provisionHelena;
      const result = await onSubmit(input, {
        provisionHelena: wantsProvision,
        helenaOptions: wantsProvision
          ? { apps: helenaApps, resourcers: helenaResourcers, config: helenaConfig }
          : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da clínica"
            required
            minLength={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Endereço</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número, bairro"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Cidade"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state">UF</Label>
            <Input
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="SP"
              maxLength={2}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contract_status">Status do contrato</Label>
          <Select
            value={contractStatus}
            onValueChange={(val) => {
              if (val) setContractStatus(val as ContractStatus);
            }}
          >
            <SelectTrigger id="contract_status" className="w-full">
              <SelectValue placeholder="Selecione o status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="suspended">Suspenso</SelectItem>
              <SelectItem value="archived">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="system">Sistema</Label>
          <Select
            value={system || SYSTEM_NONE}
            onValueChange={(val) => {
              if (val) setSystem(val === SYSTEM_NONE ? "" : val);
            }}
          >
            <SelectTrigger id="system" className="w-full">
              <SelectValue placeholder="Selecione o sistema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SYSTEM_NONE}>— Não definido —</SelectItem>
              {CLINIC_SYSTEMS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Dados do dono / documento (usados no provisionamento Helena) ── */}
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <p className="text-sm font-medium">
            Dono e documento
            {isCreate && provisionHelena && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (obrigatórios para criar na Helena)
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="owner_name">Nome do dono</Label>
              <Input
                id="owner_name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Dr(a). Nome"
                required={isCreate && provisionHelena}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner_email">E-mail do dono</Label>
              <Input
                id="owner_email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="dono@clinica.com.br"
                required={isCreate && provisionHelena}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner_phone">Telefone do dono</Label>
              <Input
                id="owner_phone"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                required={isCreate && provisionHelena}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="document_id">CNPJ / CPF</Label>
              <Input
                id="document_id"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="00.000.000/0000-00"
                required={isCreate && provisionHelena}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legal_name">Razão social</Label>
            <Input
              id="legal_name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder={isCreate && provisionHelena ? "Razão social" : "Razão social (opcional)"}
              required={isCreate && provisionHelena}
            />
          </div>
        </div>

        {isCreate && (
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="provision_helena"
                checked={provisionHelena}
                onCheckedChange={(checked) => setProvisionHelena(checked)}
              />
              <Label htmlFor="provision_helena" className="cursor-pointer">
                <span className="font-medium">Criar automaticamente na Helena</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  conta, token, usuário do dono (Admin), equipes Atendimento Humano + CRC e etiquetas padrão
                </span>
              </Label>
            </div>

            {provisionHelena && (
              <div className="space-y-4 border-t border-primary/20 pt-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Apps habilitados na conta</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {HELENA_APPS.map((app) => (
                      <label key={app.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={helenaApps.includes(app.value)}
                          onCheckedChange={(checked) =>
                            setHelenaApps((prev) => toggleIn(prev, app.value, checked === true))
                          }
                        />
                        {app.label}
                      </label>
                    ))}
                  </div>
                  {helenaApps.length === 0 && (
                    <p className="text-xs text-red-400">Selecione pelo menos um app — a Helena exige.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Recursos avançados</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {HELENA_RESOURCERS.map((r) => (
                      <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={helenaResourcers.includes(r.value)}
                          onCheckedChange={(checked) =>
                            setHelenaResourcers((prev) => toggleIn(prev, r.value, checked === true))
                          }
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Limites do plano</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {HELENA_CONFIG_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label htmlFor={`helena_cfg_${f.key}`} className="text-xs text-muted-foreground">
                          {f.label}
                        </Label>
                        <Input
                          id={`helena_cfg_${f.key}`}
                          type="number"
                          min={0}
                          value={helenaConfig[f.key] ?? f.default}
                          onChange={(e) =>
                            setHelenaConfig((prev) => ({
                              ...prev,
                              [f.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sessões têm mínimo de 1000 na Helena — valores menores são elevados automaticamente.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Switch
            id="mode"
            checked={mode === "auto"}
            onCheckedChange={(checked) => setMode(checked ? "auto" : "manual")}
          />
          <Label htmlFor="mode" className="cursor-pointer">
            Modo automático (integração Helena)
          </Label>
        </div>

        {mode === "auto" && (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-4 space-y-3">
            <p className="text-sm font-medium">Integração Helena</p>
            <HelenaIntegrationFields
              clinicId={defaultValues?.id}
              onPanelSelected={(_token, _panelId) => {
                // token/panelId tracked inside sub-component;
                // edit mode: use "Salvar integração" inside the sub-component.
                // create mode: redirect happens server-side, so integration is
                // saved via edit after the clinic is created (see note in fields).
              }}
            />
          </div>
        )}
      </div>

      <Button type="submit" disabled={isPending} size="lg">
        {isPending ? "Salvando…" : defaultValues ? "Salvar alterações" : "Criar clínica"}
      </Button>
    </form>
  );
}
