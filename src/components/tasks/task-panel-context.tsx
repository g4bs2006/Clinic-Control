"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listClinics } from "@/lib/clinics/actions";
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions";
import { listActiveTaskCategories, type TaskCategoryRow } from "@/lib/tasks/category-actions";
import { getTask } from "@/lib/tasks/actions";
import type { ClinicOption, ProfileOption } from "./task-fields";

/**
 * Painel global de tarefas (estilo "mini-player"): uma tarefa aberta em overlay
 * ancorado que sobrevive à navegação (vive no layout) e pode ser minimizada.
 * Aberto por um botão explícito (OpenInPanelButton) em qualquer tela — não
 * substitui o modal de /tarefas nem o deep-link /tarefas/[id].
 */
type TaskPanelCtx = {
  taskId: string | null;
  minimized: boolean;
  /** Título da tarefa aberta — alimenta a mini barra quando minimizada. */
  title: string | null;
  /** Dados de apoio do detalhe, carregados uma vez no primeiro open. */
  supportLoaded: boolean;
  clinics: (ClinicOption & { developerId: string | null })[];
  profiles: ProfileOption[];
  categories: TaskCategoryRow[];
  currentUserId: string | null;
  openTask: (id: string) => void;
  close: () => void;
  minimize: () => void;
  expand: () => void;
  /** Marca que algo mudou — o refresh da página de fundo acontece ao fechar. */
  markDirty: () => void;
};

const TaskPanelContext = createContext<TaskPanelCtx | null>(null);

export function useTaskPanel(): TaskPanelCtx {
  const ctx = useContext(TaskPanelContext);
  if (!ctx) throw new Error("useTaskPanel fora do TaskPanelProvider");
  return ctx;
}

export function TaskPanelProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [supportLoaded, setSupportLoaded] = useState(false);
  const [clinics, setClinics] = useState<(ClinicOption & { developerId: string | null })[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [categories, setCategories] = useState<TaskCategoryRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  // Dados de apoio, uma vez por sessão, no primeiro open — mesmo conjunto que
  // /tarefas e a paleta de busca já carregam.
  useEffect(() => {
    if (!taskId || supportLoaded) return;
    let cancelled = false;
    Promise.all([listClinics(), listUserProfiles(), listActiveTaskCategories(), getCurrentProfile()])
      .then(([cs, us, cats, me]) => {
        if (cancelled) return;
        setClinics(
          cs
            .filter((c) => c.contract_status !== "archived")
            .map((c) => ({ id: c.id, name: c.name, developerId: c.developer_id ?? null }))
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
        );
        setProfiles(us.map((u) => ({ id: u.id, name: u.name, email: u.email })));
        setCategories(cats);
        setCurrentUserId(me?.id ?? null);
        setSupportLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setSupportLoaded(false); // permite tentar de novo no próximo open
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, supportLoaded]);

  const openTask = useCallback((id: string) => {
    dirtyRef.current = false;
    setTitle(null);
    setMinimized(false);
    setTaskId(id);
    // Um getTask extra é barato e desacopla a mini barra do diálogo (que faz a
    // própria carga completa de subtarefas/anexos/atividade).
    void getTask(id).then((t) => {
      if (t) setTitle(t.title);
    });
  }, []);

  const close = useCallback(() => {
    setTaskId(null);
    setMinimized(false);
    setTitle(null);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      router.refresh();
    }
  }, [router]);

  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => setMinimized(false), []);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const value: TaskPanelCtx = {
    taskId,
    minimized,
    title,
    supportLoaded,
    clinics,
    profiles,
    categories,
    currentUserId,
    openTask,
    close,
    minimize,
    expand,
    markDirty,
  };

  return <TaskPanelContext.Provider value={value}>{children}</TaskPanelContext.Provider>;
}
