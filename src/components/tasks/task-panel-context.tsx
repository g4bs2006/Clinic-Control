"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { listClinics } from "@/lib/clinics/actions";
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions";
import { listActiveTaskCategories, type TaskCategoryRow } from "@/lib/tasks/category-actions";
import { getTask } from "@/lib/tasks/actions";
import type { ClinicOption, ProfileOption } from "./task-fields";

/**
 * Painel global de tarefas (estilo "mini-player"): uma tarefa aberta em overlay
 * ancorado que sobrevive à navegação (vive no layout), ao recarregar (F5) e
 * sincroniza entre abas do navegador (localStorage + evento `storage`).
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
  /** Etapa de aprovação (ADR 0010): só gestor conclui tarefa interna. */
  isGestor: boolean;
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

// ── Persistência (F5 + abas) ─────────────────────────────────────────────────
// O estado do painel (qual tarefa está aberta e se está minimizado) vive no
// localStorage: sobrevive ao recarregar E é compartilhado entre abas (o evento
// `storage` avisa as outras abas). Mesma ideia do filtro/sidebar do projeto:
// a memória é a verdade, o localStorage é backup + canal de sync entre abas.
const STORAGE_KEY = "cc-task-panel";
const STORAGE_EVENT = "cc-task-panel-change";

type PersistedState = { taskId: string | null; minimized: boolean };
const DEFAULT_SNAPSHOT: PersistedState = { taskId: null, minimized: false };

function parsePersisted(raw: string): PersistedState {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : null,
      minimized: !!parsed.minimized,
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

function readPersisted(): PersistedState {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parsePersisted(raw) : DEFAULT_SNAPSHOT;
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

// Espelho em memória — lido por getSnapshot (estável entre chamadas) e escrito
// por setStore. Começa null para ser populado sob demanda (só no cliente).
let store: PersistedState | null = null;

function getStoreSnapshot(): PersistedState {
  if (store === null) store = readPersisted();
  return store;
}

function setStore(next: PersistedState) {
  store = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota/modo privativo: segue só em memória (não persiste, mas não quebra).
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

// Notifica quando o store muda — tanto na mesma aba (ação do usuário) quanto nas
// outras abas (evento `storage`, que dispara apenas nas abas que NÃO escreveram).
function subscribeStore(onStoreChange: () => void): () => void {
  const onLocal = () => onStoreChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    store = e.newValue ? parsePersisted(e.newValue) : DEFAULT_SNAPSHOT;
    onStoreChange();
  };
  window.addEventListener(STORAGE_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STORAGE_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function TaskPanelProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // taskId/minimized vêm do store externo (localStorage) — hidrata sem setState
  // em effect (o snapshot do servidor é o padrão; o cliente aplica após montar).
  const { taskId, minimized } = useSyncExternalStore(
    subscribeStore,
    getStoreSnapshot,
    () => DEFAULT_SNAPSHOT,
  );
  const [titleState, setTitleState] = useState<{ taskId: string; title: string } | null>(null);
  const [supportLoaded, setSupportLoaded] = useState(false);
  const [clinics, setClinics] = useState<(ClinicOption & { developerId: string | null })[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [categories, setCategories] = useState<TaskCategoryRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isGestor, setIsGestor] = useState(false);
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
        setIsGestor(me?.role === "gestor");
        setSupportLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setSupportLoaded(false); // permite tentar de novo no próximo open
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, supportLoaded]);

  // Título da tarefa aberta (para a mini barra). Só setState em callback assíncrono.
  // Se a tarefa não existe mais (deletada em outra aba), fecha o painel.
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    void getTask(taskId).then((t) => {
      if (cancelled) return;
      if (t) setTitleState({ taskId, title: t.title });
      else setStore({ taskId: null, minimized: false });
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const openTask = useCallback((id: string) => {
    dirtyRef.current = false;
    setStore({ taskId: id, minimized: false });
  }, []);

  const close = useCallback(() => {
    setStore({ taskId: null, minimized: false });
    if (dirtyRef.current) {
      dirtyRef.current = false;
      router.refresh();
    }
  }, [router]);

  const minimize = useCallback(() => setStore({ taskId, minimized: true }), [taskId]);
  const expand = useCallback(() => setStore({ taskId, minimized: false }), [taskId]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // O título só vale se for da tarefa atualmente aberta (evita exibir o título de
  // uma tarefa anterior enquanto a nova ainda está carregando).
  const title = titleState && titleState.taskId === taskId ? titleState.title : null;

  const value: TaskPanelCtx = {
    taskId,
    minimized,
    title,
    supportLoaded,
    clinics,
    profiles,
    categories,
    currentUserId,
    isGestor,
    openTask,
    close,
    minimize,
    expand,
    markDirty,
  };

  return <TaskPanelContext.Provider value={value}>{children}</TaskPanelContext.Provider>;
}
