"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Copy, Pencil, Trash2, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listCredentials,
  revealSecret,
  createCredential,
  updateCredential,
  deleteCredential,
  type CredentialSummary,
  type CredentialInput,
} from "@/lib/vault/actions";

interface VaultManagerProps {
  initialCredentials: CredentialSummary[];
}

const EMPTY_FORM: CredentialInput = { service: "", category: "", login: "", secret: "", url: "", notes: "" };

async function copyText(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copiado`);
}

export function VaultManager({ initialCredentials }: VaultManagerProps) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialSummary | null>(null);
  const [form, setForm] = useState<CredentialInput>(EMPTY_FORM);
  const [isSaving, startSave] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();

  const grouped = useMemo(() => {
    const groups = new Map<string, CredentialSummary[]>();
    for (const c of credentials) {
      const key = c.category?.trim() || "Outros";
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [credentials]);

  function refresh() {
    startRefresh(async () => {
      const res = await listCredentials();
      if (res.ok) setCredentials(res.credentials);
    });
  }

  async function ensureRevealed(id: string): Promise<string | null> {
    if (revealed[id]) return revealed[id];
    setRevealingId(id);
    const res = await revealSecret(id);
    setRevealingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setRevealed((prev) => ({ ...prev, [id]: res.secret }));
    return res.secret;
  }

  async function toggleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    await ensureRevealed(id);
  }

  async function handleCopySecret(id: string) {
    const secret = await ensureRevealed(id);
    if (secret) await copyText(secret, "Segredo");
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: CredentialSummary) {
    setEditing(c);
    setForm({ service: c.service, category: c.category ?? "", login: c.login ?? "", secret: "", url: c.url ?? "", notes: c.notes ?? "" });
    setDialogOpen(true);
  }

  function handleSave() {
    startSave(async () => {
      const res = editing ? await updateCredential(editing.id, form) : await createCredential(form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Credencial atualizada" : "Credencial criada");
      setDialogOpen(false);
      refresh();
    });
  }

  async function handleDelete(c: CredentialSummary) {
    if (!confirm(`Excluir a credencial "${c.service}"? Essa ação não pode ser desfeita.`)) return;
    const res = await deleteCredential(c.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Credencial excluída");
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Nova credencial
        </Button>
      </div>

      {isRefreshing && <p className="text-xs text-muted-foreground">Atualizando…</p>}

      {grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma credencial cadastrada ainda.</p>
      )}

      {grouped.map(([category, items]) => (
        <div key={category} className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {category}
            </h3>
          </div>
          <div className="divide-y divide-border/60">
            {items.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{c.service}</span>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title={c.url}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  {c.login && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className="truncate">{c.login}</span>
                      <button
                        type="button"
                        onClick={() => copyText(c.login!, "Login")}
                        className="text-muted-foreground/70 hover:text-foreground"
                        title="Copiar login"
                      >
                        <Copy className="size-3" />
                      </button>
                    </div>
                  )}
                  {c.hasSecret && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                        {revealingId === c.id ? "carregando…" : revealed[c.id] ?? "••••••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReveal(c.id)}
                        className="text-muted-foreground/70 hover:text-foreground"
                        title={revealed[c.id] ? "Ocultar" : "Revelar"}
                      >
                        {revealed[c.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopySecret(c.id)}
                        className="text-muted-foreground/70 hover:text-foreground"
                        title="Copiar segredo"
                      >
                        <Copy className="size-3" />
                      </button>
                    </div>
                  )}
                  {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)} title="Editar">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(c)} title="Excluir">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar credencial" : "Nova credencial"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="service">Serviço</Label>
              <Input
                id="service"
                value={form.service}
                onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                placeholder="Ex: Supabase, n8n, Cal.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Categoria</Label>
              <Input
                id="category"
                value={form.category ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Ex: Dashboards, Contact.IA, Sala Black"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login">Login / e-mail</Label>
              <Input
                id="login"
                value={form.login ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secret">Senha / token</Label>
              <Input
                id="secret"
                type="password"
                value={form.secret ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder={editing ? "deixe vazio para manter o segredo atual" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={form.url ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input
                id="notes"
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !form.service.trim()}>
              {isSaving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
