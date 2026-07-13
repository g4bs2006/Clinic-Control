"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  createFormCredential,
  updateFormCredential,
  deleteFormCredential,
  type FormCredential,
  type FormCredentialInput,
} from "@/lib/clinics/form-credentials-actions";

// ---------------------------------------------------------------------------
// Token field with reveal toggle
// ---------------------------------------------------------------------------

function TokenField({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  const masked = value.length > 12
    ? `${value.slice(0, 8)}${"•".repeat(8)}${value.slice(-4)}`
    : "•".repeat(value.length);

  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="font-mono text-xs truncate">
        {revealed ? value : masked}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
        title={revealed ? "Ocultar token" : "Revelar token"}
      >
        {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <CopyButton value={value} label="Token" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single credential card
// ---------------------------------------------------------------------------

function CredentialCard({
  credential,
  onEdit,
  onDelete,
  system,
}: {
  credential: FormCredential;
  onEdit: () => void;
  onDelete: () => void;
  system: string | null;
}) {
  const fmtDate = credential.submitted_at
    ? new Date(credential.submitted_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground truncate">
          {credential.form_name}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[0.65rem] text-muted-foreground tabular-nums">
            {fmtDate}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Editar"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
            title="Excluir"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-2">
        {system === "Google Agenda" ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.68rem] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-24">
              ID da Agenda
            </span>
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-mono text-xs text-foreground truncate">{credential.token}</span>
              <CopyButton value={credential.token} label="ID da Agenda" />
            </div>
          </div>
        ) : (
          <>
            {credential.email && (
              <FieldRow label="E-mail" value={credential.email} />
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-24">
                Token
              </span>
              <TokenField value={credential.token} />
            </div>
            {credential.api_user && (
              <FieldRow label="Usuário API" value={credential.api_user} />
            )}
            {credential.agenda_link && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.68rem] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-24">
                  Link Agenda
                </span>
                <div className="flex items-center gap-1 min-w-0">
                  <a
                    href={credential.agenda_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline truncate"
                  >
                    {credential.agenda_link}
                  </a>
                  <CopyButton value={credential.agenda_link} label="Link Agenda" />
                </div>
              </div>
            )}
            {credential.agenda_code && (
              <FieldRow label="Cód. Agenda" value={credential.agenda_code} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic field row with copy button
// ---------------------------------------------------------------------------

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[0.68rem] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-24">
        {label}
      </span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono text-xs text-foreground truncate">{value}</span>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit form (inline)
// ---------------------------------------------------------------------------

function CredentialForm({
  clinicId,
  initial,
  onDone,
  onCancel,
  system,
}: {
  clinicId: string;
  initial?: FormCredential;
  onDone: () => void;
  onCancel: () => void;
  system: string | null;
}) {
  const isEditing = !!initial;
  const [formName, setFormName] = useState(initial?.form_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [token, setToken] = useState(initial?.token ?? "");
  const [apiUser, setApiUser] = useState(initial?.api_user ?? "");
  const [agendaLink, setAgendaLink] = useState(initial?.agenda_link ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const input: FormCredentialInput = {
        form_name: formName,
        email: email || undefined,
        token,
        api_user: apiUser || undefined,
        agenda_link: agendaLink || undefined,
      };

      const result = isEditing
        ? await updateFormCredential(initial.id, input)
        : await createFormCredential(clinicId, input);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEditing ? "Credencial atualizada!" : "Credencial adicionada!");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          {isEditing
            ? system === "Google Agenda"
              ? "Editar agenda"
              : "Editar credencial"
            : system === "Google Agenda"
              ? "Nova agenda"
              : "Nova credencial"}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="fc-name">
            {system === "Google Agenda" ? "Nome da unidade *" : "Nome da clínica/unidade *"}
          </Label>
          <Input
            id="fc-name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={system === "Google Agenda" ? "Ex.: Unidade Centro" : "Ex.: Prime Odontocenter"}
            required
          />
        </div>
        {system === "Google Agenda" ? (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fc-token">ID da Agenda (Google Calendar) *</Label>
            <Input
              id="fc-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Ex.: primary ou xxxxx@group.calendar.google.com"
              required
            />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="fc-email">E-mail</Label>
              <Input
                id="fc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@clinica.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fc-token">Token *</Label>
              <Input
                id="fc-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole o token aqui"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fc-api-user">Usuário API</Label>
              <Input
                id="fc-api-user"
                value={apiUser}
                onChange={(e) => setApiUser(e.target.value)}
                placeholder="Ex.: primeodontocenter"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fc-link">Link Agenda</Label>
              <Input
                id="fc-link"
                value={agendaLink}
                onChange={(e) => setAgendaLink(e.target.value)}
                placeholder="https://agenda.link/12345"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Salvando…"
              : "Adicionando…"
            : isEditing
              ? "Salvar"
              : "Adicionar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function ClinicFormCredentials({
  clinicId,
  credentials,
  system,
}: {
  clinicId: string;
  credentials: FormCredential[];
  system: string | null;
}) {
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: "Excluir credencial?",
      description: `"${name}" será removida em definitivo.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    startDelete(async () => {
      const result = await deleteFormCredential(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Credencial excluída.");
    });
  }

  const editingCredential = editingId
    ? credentials.find((c) => c.id === editingId)
    : undefined;

  return (
    <div className="space-y-3">
      {credentials.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhuma credencial vinculada a esta clínica.
        </p>
      )}

      {credentials.map((cred) =>
        editingId === cred.id ? (
          <CredentialForm
            key={cred.id}
            clinicId={clinicId}
            initial={editingCredential}
            onDone={() => setEditingId(null)}
            onCancel={() => setEditingId(null)}
            system={system}
          />
        ) : (
          <CredentialCard
            key={cred.id}
            credential={cred}
            onEdit={() => {
              setEditingId(cred.id);
              setShowForm(false);
            }}
            onDelete={() => handleDelete(cred.id, cred.form_name)}
            system={system}
          />
        ),
      )}

      {showForm && (
        <CredentialForm
          clinicId={clinicId}
          onDone={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
          system={system}
        />
      )}

      {!showForm && !editingId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
          disabled={isDeleting}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          {system === "Google Agenda" ? "Adicionar agenda" : "Adicionar credencial"}
        </Button>
      )}
    </div>
  );
}
