"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Building2,
  MapPin,
  X,
  CheckCircle2,
  Circle,
  ArrowLeft,
  Plus,
  ListTodo,
  PanelRightOpen,
} from "lucide-react";
import { listClinicsInScope } from "@/lib/clinics/actions";
import { listClinicTasks, updateTaskStatus, createTask, type TaskRow } from "@/lib/tasks/actions";
import { listActiveTaskCategories, type TaskCategoryRow } from "@/lib/tasks/category-actions";
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { useTaskPanel } from "@/components/tasks/task-panel-context";
import type { ProfileOption } from "@/components/tasks/task-fields";
import type { Clinic } from "@/lib/clinics/schema";
import type { TaskPriority, TaskStatus } from "@/lib/tasks/categories";
import { navItems } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgente: "bg-red-400",
  alta: "bg-orange-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-400",
};

const OPEN_STATUSES = new Set(["pendente", "em_andamento"]);

function dueLabel(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  // null = ainda não carregado (loading derivado disso, sem estado extra)
  const [clinics, setClinics] = useState<Clinic[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Modo tarefas: clínica selecionada via Tab/botão "Tarefas" ─────────────
  const [taskClinic, setTaskClinic] = useState<Clinic | null>(null);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null); // null = carregando
  // Tarefas tocadas nesta sessão da paleta: concluídas seguem visíveis
  // (riscadas) para permitir desfazer com o mesmo Enter.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<TaskCategoryRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Detalhe aberto a partir da paleta — a paleta se esconde enquanto o modal
  // está na tela e volta (com a lista recarregada) quando ele fecha.
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  // Alguma tarefa mudou? Ao fechar, refresh para as páginas refletirem.
  const dirtyRef = useRef(false);

  const defaultCategory = categories[0]?.slug ?? "outro";

  const router = useRouter();
  const { openTask: openTaskInPanel } = useTaskPanel();
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Espelho do isOpen para o atalho de teclado decidir abrir/fechar sem stale closure
  const isOpenRef = useRef(false);
  // Espelho do detalhe aberto: Ctrl+K não deve fechar a paleta por baixo do modal
  const detailRef = useRef(false);

  // O reset de busca/índice acontece no ato de abrir (handler), não em effect.
  const open = useCallback(() => {
    isOpenRef.current = true;
    setIsOpen(true);
    setQuery("");
    setActiveIndex(0);
    setTaskClinic(null);
    setTasks(null);
    setTouched(new Set());
    // Recarrega a cada abertura para refletir a carteira atual (o gestor pode ter
    // trocado o seletor global desde a última vez).
    setClinics(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      router.refresh();
    }
  }, [router]);

  const toggleOpen = useCallback(() => {
    if (isOpenRef.current) close();
    else open();
  }, [open, close]);

  // Atalhos de abertura: Ctrl/Cmd+K (robusto a Caps Lock/Shift, na fase de
  // captura para vencer o atalho do navegador enquanto a página tem foco) e
  // "/" como alternativa que nunca conflita — só fora de campos de texto.
  useEffect(() => {
    function isTyping(): boolean {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      );
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (detailRef.current) return; // modal de tarefa aberto — não mexe na paleta
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        toggleOpen();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isOpenRef.current && !isTyping()) {
        e.preventDefault();
        open();
      }
    }
    // capture: true → roda antes de qualquer outro handler da página.
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [toggleOpen, open]);

  // Listen to custom sidebar click event
  useEffect(() => {
    window.addEventListener("cc-open-search", open);
    return () => window.removeEventListener("cc-open-search", open);
  }, [open]);

  // Fetch clinics when modal opens (setState só no callback assíncrono)
  useEffect(() => {
    if (!isOpen || clinics !== null) return;
    let cancelled = false;
    listClinicsInScope()
      .then((data) => {
        if (!cancelled) setClinics(data);
      })
      .catch((err) => {
        console.error("Erro ao carregar lista de busca:", err);
        if (!cancelled) setClinics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, clinics]);

  // Fetch das tarefas ao entrar no modo tarefas (+ dados que o modal de
  // detalhe precisa: categorias, perfis e usuário logado).
  useEffect(() => {
    if (!isOpen || !taskClinic || tasks !== null) return;
    let cancelled = false;
    Promise.all([
      listClinicTasks(taskClinic.id),
      listActiveTaskCategories(),
      listUserProfiles(),
      getCurrentProfile(),
    ])
      .then(([rows, cats, users, me]) => {
        if (cancelled) return;
        setTasks(rows);
        setCategories(cats);
        setProfiles(users.map((u) => ({ id: u.id, name: u.name, email: u.email })));
        setCurrentUserId(me?.id ?? null);
      })
      .catch((err) => {
        console.error("Erro ao carregar tarefas da clínica:", err);
        if (!cancelled) setTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, taskClinic, tasks]);

  const loading = isOpen && (taskClinic ? tasks === null : clinics === null);

  // ── Itens do estágio atual ─────────────────────────────────────────────────
  const term = query.trim().toLowerCase();
  const loaded = clinics ?? [];
  const filteredClinics = term
    ? loaded.filter((c) => {
        return (
          c.name.toLowerCase().includes(term) ||
          c.city?.toLowerCase().includes(term) ||
          c.state?.toLowerCase().includes(term) ||
          c.region?.toLowerCase().includes(term) ||
          c.system?.toLowerCase().includes(term)
        );
      })
    : loaded.slice(0, 5); // show top 5 when empty
  // Páginas principais (seção "Ir para"): todas quando a busca está vazia,
  // filtradas pelo rótulo ao digitar. Vêm ANTES das clínicas no índice de teclado.
  const navPages = term ? navItems.filter((p) => p.label.toLowerCase().includes(term)) : navItems;

  // Modo tarefas: abertas + as concluídas nesta sessão (para desfazer), filtradas pela busca.
  const visibleTasks = (tasks ?? [])
    .filter((t) => OPEN_STATUSES.has(t.status) || touched.has(t.id))
    .filter((t) => !query.trim() || t.title.toLowerCase().includes(query.toLowerCase()));
  const canCreate = taskClinic !== null && query.trim().length >= 3;
  // Índice virtual: tarefas + (opcional) o item "criar tarefa" no fim.
  const taskItemCount = visibleTasks.length + (canCreate ? 1 : 0);
  const itemCount = taskClinic ? taskItemCount : navPages.length + filteredClinics.length;

  // ── Ações ──────────────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (clinicId: string) => {
      close();
      router.push(`/clinicas/${clinicId}`);
    },
    [router, close],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [router, close],
  );

  const enterTasks = useCallback((clinic: Clinic) => {
    setTaskClinic(clinic);
    setTasks(null);
    setTouched(new Set());
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, []);

  const exitTasks = useCallback(() => {
    setTaskClinic(null);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, []);

  const toggleTask = useCallback(
    (task: TaskRow) => {
      const nextStatus = task.status === "concluida" ? "pendente" : "concluida";
      // Otimista: muda na hora; reverte se o servidor recusar.
      setTasks((prev) =>
        (prev ?? []).map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
      );
      setTouched((prev) => new Set(prev).add(task.id));
      dirtyRef.current = true;
      updateTaskStatus(task.id, nextStatus).then((res) => {
        if (!res.ok) {
          setTasks((prev) =>
            (prev ?? []).map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
          );
          toast.error(res.error);
        }
      });
    },
    [],
  );

  const openDetail = useCallback((taskId: string) => {
    detailRef.current = true;
    setDetailTaskId(taskId);
  }, []);

  // Abre a tarefa no painel global (mini-player) e fecha a paleta, para o painel
  // ficar visível por cima (a paleta tem z-index maior que o painel).
  const openInPanel = useCallback(
    (taskId: string) => {
      openTaskInPanel(taskId);
      close();
    },
    [openTaskInPanel, close],
  );

  const closeDetail = useCallback(() => {
    detailRef.current = false;
    setDetailTaskId(null);
    // Recarrega a lista: o modal pode ter mudado título/status/prazo.
    setTasks(null);
    setTouched(new Set());
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Troca de status feita DENTRO do modal reflete na lista da paleta na hora.
  const detailStatusChange = useCallback((id: string, status: TaskStatus) => {
    dirtyRef.current = true;
    setTasks((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, status } : t)));
    setTouched((prev) => new Set(prev).add(id));
  }, []);

  const createQuickTask = useCallback(() => {
    if (!taskClinic || !canCreate || saving) return;
    const title = query.trim();
    setSaving(true);
    // Responsável padrão = dev da clínica (mesma regra das sugestões da IA).
    const assigneeIds = taskClinic.developer_id ? [taskClinic.developer_id] : [];
    createTask({
      clinicId: taskClinic.id,
      title,
      category: defaultCategory,
      priority: "media",
      assigneeIds,
    })
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        dirtyRef.current = true;
        setTasks((prev) => [
          {
            id: res.id,
            clinic_id: taskClinic.id,
            clinic_name: taskClinic.name,
            title,
            description: null,
            category: defaultCategory as TaskRow["category"],
            priority: "media",
            status: "pendente",
            assignees: assigneeIds.map((id) => ({ id, name: null })),
            is_blocked: false,
            blocked_by: [],
            due_date: null,
            source: "manual",
            parent_task_id: null,
            recurrence_id: null,
            snoozed_until: null,
            pinned_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null,
          },
          ...(prev ?? []),
        ]);
        setQuery("");
        setActiveIndex(0);
        toast.success("Tarefa criada.");
      })
      .finally(() => setSaving(false));
  }, [taskClinic, canCreate, saving, query, defaultCategory]);

  // Keyboard navigation inside list
  useEffect(() => {
    // Com o modal de detalhe aberto, o teclado é dele (Esc fecha o modal, não a paleta).
    if (!isOpen || detailTaskId !== null) return;

    function handleKeys(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (itemCount ? (prev + 1) % itemCount : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (itemCount ? (prev - 1 + itemCount) % itemCount : 0));
      } else if (e.key === "Tab" && !taskClinic) {
        // Tab só faz sentido sobre uma CLÍNICA (entrar nas tarefas dela); sobre
        // uma página da seção "Ir para" não há o que fazer.
        e.preventDefault();
        const clinic = filteredClinics[activeIndex - navPages.length];
        if (clinic) enterTasks(clinic);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (taskClinic) {
          if (activeIndex < visibleTasks.length) toggleTask(visibleTasks[activeIndex]);
          else if (canCreate) createQuickTask();
        } else if (activeIndex < navPages.length) {
          handleNavigate(navPages[activeIndex].href);
        } else {
          const clinic = filteredClinics[activeIndex - navPages.length];
          if (clinic) handleSelect(clinic.id);
        }
      } else if (e.key === "ArrowRight" && taskClinic && query === "") {
        // → abre o detalhe da tarefa ativa (só com a busca vazia, para não
        // roubar o cursor de quem está digitando).
        e.preventDefault();
        if (activeIndex < visibleTasks.length) openDetail(visibleTasks[activeIndex].id);
      } else if (e.key === "Backspace" && taskClinic && query === "") {
        e.preventDefault();
        exitTasks();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [
    isOpen,
    detailTaskId,
    itemCount,
    taskClinic,
    filteredClinics,
    navPages,
    visibleTasks,
    activeIndex,
    canCreate,
    query,
    handleSelect,
    handleNavigate,
    enterTasks,
    exitTasks,
    toggleTask,
    createQuickTask,
    openDetail,
    close,
  ]);

  if (!isOpen) return null;

  return (
    <>
    {/* Modal de detalhe aberto pela paleta — a paleta se esconde e volta ao fechar */}
    <TaskDetailDialog
      taskId={detailTaskId}
      clinics={loaded.map((c) => ({ id: c.id, name: c.name, developerId: c.developer_id ?? null }))}
      profiles={profiles}
      categories={categories}
      onClose={closeDetail}
      onStatusChange={detailStatusChange}
      onChanged={() => {
        dirtyRef.current = true;
      }}
      currentUserId={currentUserId}
    />
    {detailTaskId === null && (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) close();
      }}
      className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-xs flex items-start justify-center pt-[15vh] p-4"
    >
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Input area */}
        <div className="flex items-center gap-3 px-4 border-b border-zinc-900 h-12">
          {taskClinic ? (
            <button
              onClick={exitTasks}
              title="Voltar para a busca de clínicas"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4.5 shrink-0" />
            </button>
          ) : (
            <Search className="size-4.5 text-muted-foreground shrink-0" />
          )}
          {taskClinic && (
            <span className="flex max-w-[10rem] items-center gap-1.5 truncate rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground shrink-0">
              <ListTodo className="size-3 shrink-0" />
              <span className="truncate">{taskClinic.name}</span>
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0); // volta ao topo a cada mudança da busca
            }}
            placeholder={
              taskClinic
                ? "Filtrar tarefas ou digitar uma nova..."
                : "Ir para uma página ou buscar clínica..."
            }
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setActiveIndex(0);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
          <span className="text-[0.65rem] text-muted-foreground border border-zinc-800 bg-zinc-900 rounded px-1.5 py-0.5 tabular-nums">
            ESC
          </span>
        </div>

        {/* Results area */}
        <div className="max-h-[320px] overflow-y-auto p-2 scrollbar-none">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
              {taskClinic ? "Carregando tarefas..." : "Carregando clínicas..."}
            </div>
          ) : taskClinic ? (
            /* ── Modo tarefas ─────────────────────────────────────── */
            <div className="space-y-0.5">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1.5">
                Tarefas abertas · {taskClinic.name}
              </div>
              {visibleTasks.length === 0 && !canCreate && (
                <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
                  <span>Nenhuma tarefa aberta</span>
                  <span className="mt-1 text-[0.68rem] text-muted-foreground/70">
                    digite um título para criar uma nova
                  </span>
                </div>
              )}
              {visibleTasks.map((task, index) => {
                const isActive = index === activeIndex;
                const isDone = task.status === "concluida";
                return (
                  <button
                    key={task.id}
                    onClick={() => openDetail(task.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    title="Abrir detalhes da tarefa"
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-foreground border border-transparent hover:bg-zinc-900/60",
                    )}
                  >
                    {/* Bolinha = concluir/reabrir sem abrir o modal */}
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTask(task);
                      }}
                      title={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
                      className="flex size-6 -m-1 shrink-0 items-center justify-center"
                    >
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ) : (
                        <Circle
                          className={cn(
                            "size-4 transition-colors hover:text-emerald-500",
                            isActive ? "text-primary" : "text-muted-foreground/50",
                          )}
                        />
                      )}
                    </span>
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        PRIORITY_DOT[task.priority],
                      )}
                    />
                    <span className={cn("min-w-0 flex-1 truncate font-medium", isDone && "line-through text-muted-foreground")}>
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span
                        className={cn(
                          "shrink-0 text-[0.65rem] tabular-nums",
                          !isDone && task.due_date < new Date().toISOString().slice(0, 10)
                            ? "text-red-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {dueLabel(task.due_date)}
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        openInPanel(task.id);
                      }}
                      title="Abrir no painel"
                      className="flex size-6 shrink-0 -m-1 items-center justify-center text-muted-foreground/60 hover:text-foreground"
                    >
                      <PanelRightOpen className="size-3.5" />
                    </span>
                  </button>
                );
              })}
              {canCreate && (
                <button
                  onClick={createQuickTask}
                  onMouseEnter={() => setActiveIndex(visibleTasks.length)}
                  disabled={saving}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all cursor-pointer",
                    activeIndex === visibleTasks.length
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground border border-transparent hover:bg-zinc-900/60",
                  )}
                >
                  <Plus className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {saving ? "Criando…" : (
                      <>
                        Criar tarefa: <span className="font-medium text-foreground">{query.trim()}</span>
                      </>
                    )}
                  </span>
                </button>
              )}
            </div>
          ) : navPages.length === 0 && filteredClinics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <span>Nada encontrado</span>
            </div>
          ) : (
            /* ── Modo navegação: páginas ("Ir para") + clínicas ─────── */
            <div className="space-y-0.5">
              {navPages.length > 0 && (
                <>
                  <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1.5">
                    Ir para
                  </div>
                  {navPages.map((page, index) => {
                    const isActive = index === activeIndex;
                    const Icon = page.icon;
                    return (
                      <button
                        key={page.href}
                        onClick={() => handleNavigate(page.href)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all cursor-pointer",
                          isActive
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "text-foreground border border-transparent hover:bg-zinc-900/60",
                        )}
                      >
                        <Icon
                          className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{page.label}</span>
                      </button>
                    );
                  })}
                </>
              )}
              {filteredClinics.length > 0 && (
                <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1.5">
                  {query.trim() ? "Clínicas" : "Sugestões de Clínicas"}
                </div>
              )}
              {filteredClinics.map((clinic, i) => {
                const index = navPages.length + i;
                const isActive = index === activeIndex;
                const cityUf = [clinic.city, clinic.state].filter(Boolean).join("/");

                return (
                  <button
                    key={clinic.id}
                    onClick={() => handleSelect(clinic.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-all cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-foreground border border-transparent hover:bg-zinc-900/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Building2 className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{clinic.name}</div>
                        {cityUf && (
                          <div className="flex items-center gap-1 text-[0.68rem] text-muted-foreground mt-0.5">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{cityUf}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {clinic.system && (
                        <span className="text-[0.65rem] bg-zinc-900 border border-zinc-800 text-muted-foreground rounded px-1.5 py-0.5 font-medium">
                          {clinic.system}
                        </span>
                      )}
                      {/* Entra nas tarefas sem navegar (Tab faz o mesmo) */}
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          enterTasks(clinic);
                        }}
                        title={`Tarefas de ${clinic.name}`}
                        className={cn(
                          "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.65rem] font-medium transition-colors",
                          isActive
                            ? "border-primary/30 text-primary hover:bg-primary/15"
                            : "border-zinc-800 bg-zinc-900 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <ListTodo className="size-3" />
                        Tarefas
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/40 border-t border-zinc-900 text-[0.65rem] text-muted-foreground select-none">
          <div className="flex items-center gap-3">
            <span>↑↓ para navegar</span>
            {taskClinic ? (
              <>
                <span>↵ concluir</span>
                <span className="hidden sm:inline">→ abrir detalhes</span>
                <span className="hidden sm:inline">⌫ voltar</span>
              </>
            ) : (
              <>
                <span>↵ para abrir</span>
                <span>Tab: tarefas</span>
              </>
            )}
          </div>
          <span>fechar com ESC</span>
        </div>
      </div>
    </div>
    )}
    </>
  );
}
