"use client";

// Painel "Aniversariantes" na aba Cadastro: mostra se a clínica já está
// provisionada no app Aniversariantes (mensagens automáticas de aniversário)
// e, se não, oferece provisionar pré-preenchendo o que já existe no Clinic
// Control (token Helena decifrado, credenciais Clinicorp do formulário) — só
// pede à mão o que genuinamente não tem fonte hoje (usuário API de Basic
// Auth da Clinicorp, token da e-Clínica). Ver src/lib/clinics/aniversariantes-actions.ts.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { provisionAniversariantes } from "@/lib/clinics/aniversariantes-actions";
import type { AniversariantesSetup, SistemaProntuario } from "@/lib/clinics/aniversariantes-types";

// Projeto Vercel do Aniversariantes (ver Aniversariantes/README.md § Deploy).
const ANIVERSARIANTES_BASE_URL = "https://aniversariantes-murex.vercel.app";

export function ClinicAniversariantes({
  clinicId,
  clinicName,
  setup,
}: {
  clinicId: string;
  clinicName: string;
  setup: AniversariantesSetup;
}) {
  if (!setup.ok) {
    return <p className="text-sm text-destructive">{setup.error}</p>;
  }

  if (!setup.supported) {
    return (
      <p className="text-sm text-muted-foreground">
        O Aniversariantes só integra com Clinicorp e e-Clínica hoje — sem ação possível
        pro sistema desta clínica.
      </p>
    );
  }

  if (setup.clinica) {
    return <ProvisionedView clinicId={clinicId} clinicName={clinicName} setup={setup} />;
  }

  return <ProvisionForm clinicId={clinicId} clinicName={clinicName} setup={setup} />;
}

function ProvisionedView({
  clinicName,
  setup,
}: {
  clinicId: string;
  clinicName: string;
  setup: Extract<AniversariantesSetup, { ok: true }>;
}) {
  const clinica = setup.clinica!;
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ProvisionForm
        clinicId={clinica.id}
        clinicName={clinicName}
        setup={setup}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" />
        <span>
          Provisionada ({clinica.sistema_prontuario === "clinicorp" ? "Clinicorp" : "e-Clínica"})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`${ANIVERSARIANTES_BASE_URL}/?clinica=${encodeURIComponent(clinica.slug)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Abrir Aniversariantes <ExternalLink className="size-3" />
        </a>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          Atualizar credenciais
        </Button>
      </div>
    </div>
  );
}

function ProvisionForm({
  clinicId,
  clinicName,
  setup,
  onDone,
}: {
  clinicId: string;
  clinicName: string;
  setup: Extract<AniversariantesSetup, { ok: true }>;
  onDone?: () => void;
}) {
  const { suggestion, sistemaProntuario, clinica } = setup;
  const [helenaToken, setHelenaToken] = useState(clinica ? "" : suggestion.helenaToken ?? "");
  const [helenaFrom, setHelenaFrom] = useState(clinica?.helena_from ?? suggestion.helenaFrom ?? "");
  const [eclinicaToken, setEclinicaToken] = useState("");
  const [clinicorpUsuarioApi, setClinicorpUsuarioApi] = useState(clinica?.clinicorp_usuario_api ?? "");
  const [clinicorpTokenApi, setClinicorpTokenApi] = useState(clinica ? "" : suggestion.clinicorpTokenApi ?? "");
  const [clinicorpSubscriberId, setClinicorpSubscriberId] = useState(
    clinica ? "" : suggestion.clinicorpSubscriberId ?? "",
  );
  const [pending, startTransition] = useTransition();

  const isClinicorp: boolean = sistemaProntuario === "clinicorp";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await provisionAniversariantes(clinicId, clinicName, {
        sistemaProntuario: sistemaProntuario as SistemaProntuario,
        helenaToken,
        helenaFrom,
        eclinicaToken,
        clinicorpUsuarioApi,
        clinicorpTokenApi,
        clinicorpSubscriberId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(clinica ? "Credenciais atualizadas" : "Clínica provisionada no Aniversariantes");
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!suggestion.companyId && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Nenhuma conta Helena integrada ainda (aba Cadastro → Integração Helena) — o
          Aniversariantes usa esse id como identificador da clínica, provisionar vai falhar
          até isso existir.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="an-helena-token">
            Token Helena {suggestion.helenaToken && !clinica && "(sugerido do cadastro)"}
          </Label>
          <Input
            id="an-helena-token"
            value={helenaToken}
            onChange={(e) => setHelenaToken(e.target.value)}
            placeholder="Cole o token aqui"
            required
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="an-helena-from">Número remetente (WhatsApp, opcional)</Label>
          <Input
            id="an-helena-from"
            value={helenaFrom}
            onChange={(e) => setHelenaFrom(e.target.value)}
            placeholder="Ex.: 5545999990000"
          />
        </div>

        {isClinicorp ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="an-cp-usuario">Usuário API (Basic Auth) *</Label>
              <Input
                id="an-cp-usuario"
                value={clinicorpUsuarioApi}
                onChange={(e) => setClinicorpUsuarioApi(e.target.value)}
                placeholder="Sem fonte no Clinic Control — digitar"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="an-cp-token">
                Token API * {suggestion.clinicorpTokenApi && !clinica && "(do formulário)"}
              </Label>
              <Input
                id="an-cp-token"
                value={clinicorpTokenApi}
                onChange={(e) => setClinicorpTokenApi(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="an-cp-subscriber">
                Subscriber ID * {suggestion.clinicorpSubscriberId && !clinica && "(do formulário)"}
              </Label>
              <Input
                id="an-cp-subscriber"
                value={clinicorpSubscriberId}
                onChange={(e) => setClinicorpSubscriberId(e.target.value)}
                required
              />
            </div>
            {suggestion.formCredentialLabel && !clinica && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Sugestão vinda da credencial &quot;{suggestion.formCredentialLabel}&quot; — confira
                antes de salvar, sobretudo se a clínica tiver mais de uma unidade cadastrada.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="an-ec-token">Token e-Clínica *</Label>
            <Input
              id="an-ec-token"
              value={eclinicaToken}
              onChange={(e) => setEclinicaToken(e.target.value)}
              placeholder="Sem fonte no Clinic Control — digitar"
              required
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {clinica ? "Salvar" : "Provisionar"}
        </Button>
        {onDone && (
          <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={pending}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
