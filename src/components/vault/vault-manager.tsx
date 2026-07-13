"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Plus,
  ExternalLink,
  Search,
  KeyRound,
  Lock,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  revealSecret,
  createCredential,
  updateCredential,
  deleteCredential,
  type CredentialSummary,
  type CredentialInput,
} from "@/lib/vault/actions";

interface VaultManagerProps {
  initialCredentials: CredentialSummary[];
  /** Só afeta a UI (ações de gestão, badge de visibilidade) — a autorização real vive nas actions. */
  isGestor: boolean;
}

type FormState = Omit<CredentialInput, "clearSecret">;

const EMPTY_FORM: FormState = {
  service: "",
  category: "",
  login: "",
  secret: "",
  visibleToDevs: false,
  url: "",
  notes: "",
};

/** Janela de exposição: segredo revelado se auto-oculta depois disso. */
const EXPOSURE_MS = 30_000;

function fmtRelative(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "agora há pouco";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ── Assinatura visual: o ciclo de revelação ─────────────────────────────────
// O segredo "resolve" na tela (caracteres embaralhados → texto real) e fica
// emoldurado em âmbar enquanto exposto; a linha fina drena por 30s até o
// auto-ocultamento. Motion que codifica o estado real (exposto/oculto), não
// decoração — e respeita prefers-reduced-motion.

const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#";

function ScrambleText({ text }: { text: string }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    // Textos longos (docs/JSON) e reduced-motion pulam direto pro texto real.
    if (text.length > 160 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }
    let frame = 0;
    const totalFrames = 10;
    const id = setInterval(() => {
      frame++;
      const resolved = Math.floor((frame / totalFrames) * text.length);
      let out = text.slice(0, resolved);
      for (let i = resolved; i < text.length; i++) {
        out += text[i] === "\n" ? "\n" : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      setDisplay(out);
      if (frame >= totalFrames) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [text]);

  return <>{display}</>;
}

function ExposureTimer({ onExpire }: { onExpire: () => void }) {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const [draining, setDraining] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setDraining(true));
    const t = setTimeout(() => expireRef.current(), EXPOSURE_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="h-px w-full overflow-hidden bg-amber-500/15">
      <div
        className="h-px bg-amber-400/80 transition-[width] ease-linear motion-reduce:transition-none"
        style={{ width: draining ? "0%" : "100%", transitionDuration: `${EXPOSURE_MS}ms` }}
      />
    </div>
  );
}

export function VaultManager({ initialCredentials, isGestor }: VaultManagerProps) {
  const [items, setItems] = useState(initialCredentials);
  const [query, setQuery] = useState("");
  // Cache do plaintext decriptado (por sessão de página) e conjunto do que
  // está VISÍVEL — separados de propósito: "copiar sem revelar" preenche o
  // cache sem expor nada na tela. A primeira busca de cada segredo é auditada
  // no servidor; após editar o segredo o cache é invalidado.
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialSummary | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [clearSecret, setClearSecret] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CredentialSummary | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  // Sugestões de categoria no formulário — evita "Dashboards" e "dashboards"
  // virarem dois grupos por digitação livre.
  const knownCategories = useMemo(
    () => [...new Set(items.map((c) => c.category?.trim()).filter(Boolean))] as string[],
    [items],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((c) =>
          [c.service, c.login, c.category, c.notes, c.url]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : items;
    const map = new Map<string, CredentialSummary[]>();
    for (const c of filtered) {
      const key = c.category?.trim() || "Outros";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([category, list]) => ({
        category,
        list: [...list].sort((a, b) => a.service.localeCompare(b.service, "pt-BR")),
      }));
  }, [items, query]);

  async function fetchSecret(id: string): Promise<string | null> {
    if (secrets[id]) return secrets[id];
    setLoadingId(id);
    try {
      const res = await revealSecret(id);
      if (!res.ok) {
        toast.error(res.error);
        return null;
      }
      setSecrets((prev) => ({ ...prev, [id]: res.secret }));
      return res.secret;
    } catch {
      toast.error("Falha ao buscar o conteúdo — tente novamente");
      return null;
    } finally {
      setLoadingId(null);
    }
  }

  function conceal(id: string) {
    setShown((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function toggleShown(id: string) {
    if (shown[id]) {
      conceal(id);
      return;
    }
    const secret = await fetchSecret(id);
    if (secret != null) setShown((prev) => ({ ...prev, [id]: true }));
  }

  function invalidateSecret(id: string) {
    setSecrets((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    conceal(id);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setClearSecret(false);
    setSecretVisible(false);
    setDialogOpen(true);
  }

  function openEdit(c: CredentialSummary) {
    setEditing(c);
    setForm({
      service: c.service,
      category: c.category ?? "",
      login: c.login ?? "",
      secret: "",
      visibleToDevs: c.visibleToDevs,
      url: c.url ?? "",
      notes: c.notes ?? "",
    });
    setClearSecret(false);
    setSecretVisible(false);
    setDialogOpen(true);
  }

  function handleSave() {
    startSave(async () => {
      try {
        if (editing) {
          const res = await updateCredential(editing.id, { ...form, clearSecret });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          setItems((prev) => prev.map((i) => (i.id === editing.id ? res.credential : i)));
          // Segredo trocado/limpo: o plaintext em cache é de antes da edição —
          // servir ele no copiar/revelar entregaria a credencial ROTACIONADA.
          if (res.secretChanged) invalidateSecret(editing.id);
          toast.success("Item atualizado");
        } else {
          const res = await createCredential(form);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          setItems((prev) => [...prev, res.credential]);
          toast.success("Item criado");
        }
        setDialogOpen(false);
      } catch {
        toast.error("Falha ao salvar — tente novamente");
      }
    });
  }

  function handleDelete() {
    const target = deleteTarget;
    if (!target) return;
    startDelete(async () => {
      try {
        const res = await deleteCredential(target.id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setItems((prev) => prev.filter((i) => i.id !== target.id));
        invalidateSecret(target.id);
        setDeleteTarget(null);
        toast.success("Item excluído");
      } catch {
        toast.error("Falha ao excluir — tente novamente");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Busca + novo ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por serviço, login, categoria ou nota…"
            className="pl-8"
          />
        </div>
        {isGestor && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            Novo item
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <KeyRound className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isGestor
              ? "O cofre está vazio. Guarde aqui logins, tokens, chaves e outros acessos da operação."
              : "Nenhum acesso foi compartilhado com a equipe ainda."}
          </p>
          {isGestor && (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="size-4" />
              Guardar o primeiro item
            </Button>
          )}
        </div>
      )}

      {items.length > 0 && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nada encontrado para &quot;{query.trim()}&quot;.
        </p>
      )}

      {groups.map(({ category, list }) => (
        <section key={category}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {category}
            </h3>
            <span className="text-[0.65rem] tabular-nums text-muted-foreground/70">
              {list.length} {list.length === 1 ? "item" : "itens"}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="divide-y divide-border/60">
              {list.map((c) => {
                const isShown = !!shown[c.id] && !!secrets[c.id];
                return (
                  <div key={c.id} className="group px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{c.service}</span>
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
                              title={c.url}
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                          {/* Badge de visibilidade — só o gestor precisa saber o recorte;
                              para o dev, tudo que aparece já é compartilhado. */}
                          {isGestor && (
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[0.6rem]",
                                c.visibleToDevs
                                  ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                                  : "border-border/60 text-muted-foreground/70",
                              )}
                              title={
                                c.visibleToDevs
                                  ? "Desenvolvedores veem e revelam este item"
                                  : "Visível apenas para gestores"
                              }
                            >
                              {c.visibleToDevs ? <Users className="size-2.5" /> : <Lock className="size-2.5" />}
                              {c.visibleToDevs ? "equipe" : "gestores"}
                            </span>
                          )}
                          <span
                            className="ml-auto shrink-0 text-[0.65rem] text-muted-foreground/60"
                            title={new Date(c.updatedAt).toLocaleString("pt-BR")}
                          >
                            atualizado {fmtRelative(c.updatedAt)}
                          </span>
                        </div>

                        {c.login && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span className="truncate">{c.login}</span>
                            <CopyButton value={c.login} label="Login" className="size-6" />
                          </div>
                        )}

                        {c.hasSecret && (
                          <div
                            className={cn(
                              "rounded-md border transition-colors",
                              isShown ? "border-amber-500/40 bg-amber-500/[0.04]" : "border-border/60 bg-muted/30",
                            )}
                          >
                            <div className="flex items-start gap-1 px-2.5 py-1.5">
                              <pre className="max-h-40 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
                                {isShown ? (
                                  <ScrambleText text={secrets[c.id]} />
                                ) : loadingId === c.id ? (
                                  "decriptando…"
                                ) : (
                                  "••••••••••••••••"
                                )}
                              </pre>
                              <button
                                type="button"
                                onClick={() => toggleShown(c.id)}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={isShown ? "Ocultar agora" : "Revelar por 30 segundos"}
                              >
                                {isShown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <CopyButton
                                getValue={() => fetchSecret(c.id)}
                                label="Conteúdo"
                                className="size-6"
                              />
                            </div>
                            {isShown && <ExposureTimer onExpire={() => conceal(c.id)} />}
                          </div>
                        )}

                        {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                      </div>

                      {isGestor && (
                        <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <Button size="icon-sm" variant="ghost" onClick={() => openEdit(c)} title="Editar item">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(c)}
                            title="Excluir item"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      {/* ── Criar / editar ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Ajuste os dados do item guardado no cofre."
                : "Guarde um acesso da operação — o conteúdo sensível é cifrado antes de sair do navegador do servidor."}
            </DialogDescription>
          </DialogHeader>

          <datalist id="vault-categories">
            {knownCategories.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>

          <div className="space-y-5">
            {/* Identificação */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="service">Título</Label>
                <Input
                  id="service"
                  value={form.service}
                  onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                  placeholder="Ex: Supabase, JWT do n8n, Grupo WhatsApp…"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    list="vault-categories"
                    value={form.category ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Ex: Dashboards, Sala Black"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login">Login / e-mail</Label>
                  <Input
                    id="login"
                    value={form.login ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </div>

            {/* Conteúdo sensível */}
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="secret" className="flex items-center gap-1.5">
                  <Lock className="size-3 text-muted-foreground" />
                  Conteúdo sensível
                </Label>
                <button
                  type="button"
                  onClick={() => setSecretVisible((v) => !v)}
                  disabled={clearSecret}
                  className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  {secretVisible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  {secretVisible ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <Textarea
                id="secret"
                value={form.secret ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder={
                  editing?.hasSecret
                    ? "Vazio mantém o conteúdo atual"
                    : "Senha, token, JSON, texto — o que precisa ficar cifrado"
                }
                rows={4}
                disabled={clearSecret}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                className={cn("bg-background font-mono", !secretVisible && "[-webkit-text-security:disc]")}
              />
              {editing?.hasSecret && (
                <button
                  type="button"
                  onClick={() => {
                    setClearSecret((v) => !v);
                    setForm((f) => ({ ...f, secret: "" }));
                  }}
                  className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Checkbox checked={clearSecret} tabIndex={-1} className="pointer-events-none size-4" />
                  Remover o conteúdo sensível deste item ao salvar
                </button>
              )}
            </div>

            {/* Compartilhamento com a equipe */}
            <label
              htmlFor="visible-to-devs"
              className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3"
            >
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Users className="size-3.5 text-muted-foreground" />
                  Compartilhar com a equipe
                </span>
                <span className="block text-xs text-muted-foreground">
                  Desenvolvedores poderão ver e revelar este item. Desligado, fica só para gestores.
                </span>
              </span>
              <Switch
                id="visible-to-devs"
                checked={form.visibleToDevs}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, visibleToDevs: checked }))}
              />
            </label>

            {/* Referências */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  placeholder="Opcional"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !form.service.trim()}>
              {isSaving ? "Salvando…" : editing ? "Salvar alterações" : "Guardar no cofre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de exclusão ── */}
      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir &quot;{deleteTarget?.service}&quot;?</DialogTitle>
            <DialogDescription>
              O item sai do cofre e o conteúdo cifrado é apagado. O histórico de revelações fica
              preservado no log de auditoria.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Excluindo…" : "Excluir item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
