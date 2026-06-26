"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Clinic, ClinicInput } from "@/lib/clinics/schema";

type ContractStatus = "active" | "suspended" | "archived";
type Mode = "manual" | "auto";

interface ClinicFormProps {
  defaultValues?: Clinic;
  onSubmit: (
    input: ClinicInput
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
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const input: ClinicInput = {
      name,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      mode,
      contract_status: contractStatus,
    };

    startTransition(async () => {
      const result = await onSubmit(input);
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
          <Card className="border-dashed border-muted-foreground/40">
            <CardHeader>
              <CardTitle className="text-sm">Integração Helena</CardTitle>
              <CardDescription>
                Configuração da integração Helena chega na Fase 2
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Em breve você poderá conectar esta clínica à plataforma Helena para sincronização
                automática de dados e métricas.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Button type="submit" disabled={isPending} size="lg">
        {isPending ? "Salvando…" : defaultValues ? "Salvar alterações" : "Criar clínica"}
      </Button>
    </form>
  );
}
